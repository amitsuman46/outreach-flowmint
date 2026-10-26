import type { Browser } from "playwright";
import {
  captureHomepage,
  launchScreenshotBrowser,
  reviewPage,
  saveScreenshot,
  SiteBlockedError,
  SiteUnreachableError,
} from "./audit";
import { PREPARE_BATCH } from "./constants";
import { FIT_SYSTEM_PROMPT } from "./fit-prompt";
import { writeDraft } from "./draft";
import { fitSchema, generateObject, AiNotConfiguredError } from "./ai";
import { deploySite, NetlifyNotConfiguredError } from "./netlify";
import { prisma } from "./prisma";
import { buildProposal } from "./proposal";
import { asMode, type Finding, type LeadMode, type RunView } from "./schemas";
import { netlifyReady } from "./site-config";
import { mobileFacts } from "./site-facts";
import { findingsSchema } from "./schemas";

/**
 * Whether a run is alive is decided by its heartbeat in the database, not by memory.
 * Next gives routes (and dev reloads) separate copies of this module, so an in-memory flag
 * let two runs start at once and marked live runs as interrupted.
 */
const HEARTBEAT_MS = 15_000;
const STALE_MS = 90_000;

function isAlive(run: { status: string; updatedAt: Date }): boolean {
  return run.status === "running" && Date.now() - run.updatedAt.getTime() < STALE_MS;
}

async function liveRun() {
  const run = await prisma.outreachRun.findFirst({ orderBy: { createdAt: "desc" } });
  return run && isAlive(run) ? run : null;
}

function asRun(run: {
  id: string;
  kind: string;
  mode: string;
  status: string;
  total: number;
  done: number;
  step: string | null;
  error: string | null;
}): RunView {
  const status = run.status === "running" || run.status === "error" ? run.status : "done";
  return {
    id: run.id,
    kind: run.kind === "refresh" ? "refresh" : "prepare",
    mode: asMode(run.mode),
    status,
    total: run.total,
    done: run.done,
    step: run.step,
    error: run.error,
  };
}

export async function currentRun(): Promise<RunView | null> {
  const run = await prisma.outreachRun.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!run) return null;
  if (run.status === "running" && !isAlive(run)) {
    const interrupted = await prisma.outreachRun.update({
      where: { id: run.id },
      data: { status: "error", error: "The run stopped unexpectedly, for example when the server restarted. Run it again." },
    });
    return asRun(interrupted);
  }
  return asRun(run);
}

type OpenBrowser = () => Promise<Browser>;
type SetStep = (step: string) => Promise<void>;
/** Handles one lead inside a run. Returns true when a concept page was built. */
type Worker = (id: string, openBrowser: OpenBrowser, setStep: SetStep) => Promise<boolean>;

/** Starts one background run unless another is already going. */
async function launchRun(
  kind: "prepare" | "refresh",
  mode: LeadMode,
  pick: () => Promise<string[]>,
  worker: Worker,
): Promise<{ started: boolean; run: RunView }> {
  // One run at a time across both workflows: they share the browser, the AI quota and the publish step.
  const existing = await liveRun();
  if (existing) return { started: false, run: asRun(existing) };
  const ids = await pick();
  const run = await prisma.outreachRun.create({
    data: { kind, mode, status: ids.length ? "running" : "done", total: ids.length, done: 0 },
  });
  // Two clicks can land together. If an older run is also live, this one stands down.
  const live = await prisma.outreachRun.findFirst({
    where: {
      status: "running",
      updatedAt: { gt: new Date(Date.now() - STALE_MS) },
      // Only the newer of two runs stands down, so one of them always goes ahead.
      OR: [{ createdAt: { lt: run.createdAt } }, { createdAt: run.createdAt, id: { lt: run.id } }],
    },
  });
  if (live) {
    await prisma.outreachRun.delete({ where: { id: run.id } });
    return { started: false, run: asRun(live) };
  }
  if (ids.length) void processBatch(run.id, ids, worker);
  return { started: true, run: asRun(run) };
}

/** Leads in a workflow that Prepare still has work for. */
export function waitingWhere(mode: LeadMode) {
  return mode === "ppt"
    ? {
        mode,
        // Drafts made before proposals existed get a concept page and PDF too.
        OR: [{ status: { in: ["imported", "fit", "audited"] } }, { status: "drafted", proposal: null }],
      }
    : { mode, status: { in: ["imported", "fit", "audited"] } };
}

export function startPrepare(mode: LeadMode = "ppt"): Promise<{ started: boolean; run: RunView }> {
  return launchRun(
    "prepare",
    mode,
    async () => {
      const prospects = await prisma.prospect.findMany({
        where: waitingWhere(mode),
        orderBy: { createdAt: "asc" },
        take: PREPARE_BATCH,
        select: { id: true },
      });
      return prospects.map((prospect) => prospect.id);
    },
    advanceProspect,
  );
}

const REFRESH_LIMIT = 25;

/**
 * Rebuilds the concept and PDF from the live site, then rewrites the email, for unsent drafts.
 * Pass ids to refresh specific leads; otherwise every unsent draft (up to 25) is refreshed.
 */
export function startRefresh(mode: LeadMode, ids?: string[]): Promise<{ started: boolean; run: RunView }> {
  return launchRun(
    "refresh",
    mode,
    async () => {
      const prospects = await prisma.prospect.findMany({
        where: { mode, status: "drafted", ...(ids?.length ? { id: { in: ids } } : {}) },
        orderBy: { updatedAt: "asc" },
        take: REFRESH_LIMIT,
        select: { id: true },
      });
      return prospects.map((prospect) => prospect.id);
    },
    refreshProspect,
  );
}

async function refreshProspect(id: string, openBrowser: OpenBrowser, setStep: SetStep): Promise<boolean> {
  const prospect = await prisma.prospect.findUnique({ where: { id }, include: { audit: true } });
  if (!prospect || prospect.status !== "drafted" || !prospect.audit) return false;
  if (prospect.mode === "template" || !prospect.audit.reachable) {
    // No concept or PDF to rebuild (template workflow, or a site that could not be opened).
    try {
      await setStep(`Rewriting email · ${prospect.company}`);
      await writeDraft(id);
    } catch (error) {
      await prisma.prospect.update({ where: { id }, data: { lastError: plainPrepareError(error) } });
    }
    return false;
  }
  let built = false;
  try {
    await setStep(`Rebuilding concept and PDF · ${prospect.company}`);
    await buildProposal(id, await openBrowser());
    built = true;
  } catch (error) {
    await prisma.prospect.update({ where: { id }, data: { lastError: `Proposal: ${plainPrepareError(error)}` } });
  }
  try {
    await setStep(`Rewriting email · ${prospect.company}`);
    await writeDraft(id);
  } catch (error) {
    await prisma.prospect.update({ where: { id }, data: { lastError: plainPrepareError(error) } });
  }
  return built;
}

async function processBatch(runId: string, ids: string[], worker: Worker): Promise<void> {
  const session = { browser: null as Browser | null };
  const openBrowser = async (): Promise<Browser> => {
    if (session.browser) return session.browser;
    const launched = await launchScreenshotBrowser();
    session.browser = launched;
    return launched;
  };
  const setStep = (step: string) =>
    prisma.outreachRun.update({ where: { id: runId }, data: { step } }).then(() => undefined);
  // Touching the row keeps updatedAt fresh while one slow step runs.
  const heartbeat = setInterval(() => {
    void prisma.outreachRun
      .update({ where: { id: runId }, data: { updatedAt: new Date() } })
      .catch(() => undefined);
  }, HEARTBEAT_MS);
  try {
    let note: string | null = null;
    let failed = 0;
    let firstFailure = "";
    for (const id of ids) {
      const built = await worker(id, openBrowser, setStep);
      // A lead that hit an error keeps it on lastError. Count those so a run never looks clean when it wasn't.
      const after = await prisma.prospect.findUnique({ where: { id }, select: { lastError: true } });
      if (after?.lastError && !after.lastError.startsWith("Draft check:")) {
        failed += 1;
        firstFailure ||= after.lastError;
      }
      // Publish each concept as soon as it is ready, so its link works without waiting for the batch.
      if (built && netlifyReady()) {
        await setStep("Publishing to Netlify");
        try {
          await deploySite();
        } catch (error) {
          note = `A concept was built, but publishing failed: ${error instanceof Error ? error.message : "unknown error"}`;
        }
      }
      await prisma.outreachRun.update({
        where: { id: runId },
        data: { done: { increment: 1 } },
      });
    }
    if (failed) {
      const failures = `${failed} of ${ids.length} ${ids.length === 1 ? "lead" : "leads"} failed: ${firstFailure}`;
      note = note ? `${failures} ${note}` : failures;
    }
    await prisma.outreachRun.update({
      where: { id: runId },
      data: { status: "done", step: null, error: note },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The run failed";
    await prisma.outreachRun.update({
      where: { id: runId },
      data: { status: "error", error: message },
    });
  } finally {
    clearInterval(heartbeat);
    await session.browser?.close();
  }
}

/** Moves one person as far as it can. Returns true when a concept page was built. */
async function advanceProspect(
  id: string,
  openBrowser: () => Promise<Browser>,
  setStep: (step: string) => Promise<void>,
): Promise<boolean> {
  let built = false;
  try {
    let prospect = await prisma.prospect.findUnique({ where: { id }, include: { proposal: true } });
    if (!prospect) return false;
    const who = prospect.company;
    if (prospect.status === "imported") {
      await setStep(`Checking fit · ${who}`);
      await classify(prospect.id);
      prospect = await prisma.prospect.findUnique({ where: { id }, include: { proposal: true } });
      if (!prospect || prospect.status !== "fit") return false;
    }
    if (prospect.status === "fit") {
      await setStep(`Reviewing website · ${who}`);
      await audit(prospect.id, await openBrowser());
      prospect = await prisma.prospect.findUnique({ where: { id }, include: { proposal: true } });
      if (!prospect || prospect.status !== "audited") return false;
    }
    const reviewed = await prisma.audit.findUnique({ where: { prospectId: id }, select: { reachable: true } });
    if (
      prospect.mode === "ppt" &&
      reviewed?.reachable !== false &&
      (prospect.status === "audited" || prospect.status === "drafted") &&
      !prospect.proposal
    ) {
      await setStep(`Building concept page and PDF · ${who}`);
      try {
        await buildProposal(prospect.id, await openBrowser());
        built = true;
      } catch (error) {
        // A missing concept should not block the draft. It can be rebuilt from the lead page.
        await prisma.prospect.update({
          where: { id },
          data: { lastError: `Proposal: ${plainPrepareError(error)}` },
        });
      }
    }
    if (prospect.status === "audited") {
      await setStep(`Drafting email · ${who}`);
      await draft(prospect.id);
    }
    if (built) {
      await prisma.prospect.update({ where: { id }, data: { lastError: null } });
    }
  } catch (error) {
    await prisma.prospect.update({
      where: { id },
      data: { lastError: plainPrepareError(error) },
    });
  }
  return built;
}

async function classify(id: string): Promise<void> {
  const prospect = await prisma.prospect.findUnique({ where: { id } });
  if (!prospect) return;
  const prompt = [
    `Name: ${prospect.name}`,
    `Title: ${prospect.title ?? "—"}`,
    `Seniority: ${prospect.seniority ?? "—"}`,
    `Department: ${prospect.departments ?? "—"}`,
    `Company: ${prospect.company}`,
    `Website: ${prospect.website ?? "—"}`,
    `Industry: ${prospect.industry ?? "—"}`,
    `Employees: ${prospect.employees ?? "—"}`,
    `Country: ${prospect.country ?? "—"}`,
    `Technologies: ${prospect.technologies ?? "—"}`,
    `Keywords: ${prospect.keywords ?? "—"}`,
    `Annual revenue: ${prospect.annualRevenue ?? "—"}`,
    `Qualify Contact column: ${prospect.qualifyContact ?? "—"}`,
  ].join("\n");

  const result = await generateObject<{ fit?: boolean; reason?: string }>({
    system: FIT_SYSTEM_PROMPT,
    prompt,
    schema: fitSchema,
  });
  const reason = (result.reason ?? "").trim() || "No reason returned";
  await prisma.prospect.update({
    where: { id },
    data: result.fit
      ? { status: "fit", rejectReason: null, lastError: null }
      : { status: "rejected", rejectReason: reason, lastError: null },
  });
}

async function audit(id: string, browser: Browser): Promise<void> {
  const prospect = await prisma.prospect.findUnique({ where: { id } });
  if (!prospect?.website) {
    await prisma.prospect.update({
      where: { id },
      data: { lastError: "Missing website" },
    });
    return;
  }
  let capture;
  try {
    capture = await captureHomepage(browser, prospect.website);
  } catch (error) {
    if (!(error instanceof SiteBlockedError) && !(error instanceof SiteUnreachableError)) throw error;
    // The site can't be reviewed. Record why and carry on: the draft step writes a different
    // email that doesn't rely on a review, instead of the lead failing or blocking the batch.
    const data = {
      pageUrl: prospect.website,
      screenshotPath: null,
      pageText: null,
      findings: "[]",
      facts: null,
      reachable: false,
      unreachableReason: error instanceof SiteBlockedError ? "blocked" : `down: ${error.message}`,
    };
    await prisma.audit.upsert({ where: { prospectId: id }, create: { prospectId: id, ...data }, update: data });
    await prisma.prospect.update({ where: { id }, data: { status: "audited", lastError: null } });
    return;
  }
  const findings = await reviewPage(capture);
  const screenshotPath = await saveScreenshot(id, capture.screenshot);
  const facts = capture.facts ? { ...capture.facts, mobile: await mobileFacts(browser, capture.pageUrl) } : null;
  await prisma.audit.upsert({
    where: { prospectId: id },
    create: {
      prospectId: id,
      pageUrl: capture.pageUrl,
      screenshotPath,
      pageText: capture.pageText,
      findings: JSON.stringify(findings),
      facts: facts ? JSON.stringify(facts) : null,
      reachable: true,
      unreachableReason: null,
    },
    update: {
      pageUrl: capture.pageUrl,
      screenshotPath,
      pageText: capture.pageText,
      findings: JSON.stringify(findings),
      facts: facts ? JSON.stringify(facts) : null,
      reachable: true,
      unreachableReason: null,
    },
  });
  await prisma.prospect.update({
    where: { id },
    data: { status: "audited", lastError: null },
  });
}

async function draft(id: string): Promise<void> {
  await writeDraft(id);
}

export function plainPrepareError(error: unknown): string {
  if (error instanceof AiNotConfiguredError) {
    return "Add OPENAI_API_KEY to .env before Prepare can classify and draft.";
  }
  const raw = error instanceof Error ? error.message : "Prepare failed for this person";
  if (/OpenAI 401|invalid.*api key|incorrect api key/i.test(raw)) {
    return "OpenAI rejected the API key. Check OPENAI_API_KEY in .env.";
  }
  if (/insufficient_quota|exceeded your current quota|billing/i.test(raw)) {
    return "The OpenAI account is out of credit. Add billing, then prepare this person again.";
  }
  if (/OpenAI 50\d|503|UNAVAILABLE|high demand/i.test(raw)) {
    return "The model is busy right now. Prepare this person again in a minute.";
  }
  if (/429|RESOURCE_EXHAUSTED/i.test(raw)) {
    return "The model is rate limited. Prepare this person again in a minute.";
  }
  if (error instanceof NetlifyNotConfiguredError || error instanceof SiteBlockedError) return error.message;
  if (/Executable doesn't exist|playwright/i.test(raw)) {
    return "The screenshot browser did not open. Prepare this person again.";
  }
  // A database client older than the schema (the dev server was not restarted after an update).
  if (/Unknown (argument|field|arg)|PrismaClientValidationError|Invalid `prisma\./i.test(raw)) {
    return "The desk was updated while it was running. Stop it and run npm run dev again, then prepare again.";
  }
  const quoted = raw.match(/"message"\s*:\s*"([^"]+)"/);
  // Some messages start with a blank line, so take the first line that has text.
  const line = (quoted?.[1] ?? raw.split("\n").find((part) => part.trim()) ?? "").trim();
  return line.slice(0, 180) || "Prepare failed for this person. Try again.";
}

export function parseFindings(raw: string): Finding[] {
  try {
    const parsed = findingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
