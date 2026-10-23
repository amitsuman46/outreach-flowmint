import type { Browser } from "playwright";
import {
  captureHomepage,
  launchScreenshotBrowser,
  reviewPage,
  saveScreenshot,
  SiteBlockedError,
} from "./audit";
import { PREPARE_BATCH } from "./constants";
import { FIT_SYSTEM_PROMPT } from "./fit-prompt";
import { writeDraft } from "./draft";
import { fitSchema, generateObject, AiNotConfiguredError } from "./ai";
import { deploySite, NetlifyNotConfiguredError } from "./netlify";
import { prisma } from "./prisma";
import { buildProposal } from "./proposal";
import type { Finding, RunView } from "./schemas";
import { netlifyReady } from "./site-config";
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
  pick: () => Promise<string[]>,
  worker: Worker,
): Promise<{ started: boolean; run: RunView }> {
  const existing = await liveRun();
  if (existing) return { started: false, run: asRun(existing) };
  const ids = await pick();
  const run = await prisma.outreachRun.create({
    data: { kind, status: ids.length ? "running" : "done", total: ids.length, done: 0 },
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

export function startPrepare(): Promise<{ started: boolean; run: RunView }> {
  return launchRun(
    "prepare",
    async () => {
      // Drafts made before proposals existed get a concept page and PDF too.
      const prospects = await prisma.prospect.findMany({
        where: {
          OR: [
            { status: { in: ["imported", "fit", "audited"] } },
            { status: "drafted", proposal: null },
          ],
        },
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
export function startRefresh(ids?: string[]): Promise<{ started: boolean; run: RunView }> {
  return launchRun(
    "refresh",
    async () => {
      const prospects = await prisma.prospect.findMany({
        where: { status: "drafted", ...(ids?.length ? { id: { in: ids } } : {}) },
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
    for (const id of ids) {
      const built = await worker(id, openBrowser, setStep);
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
    if ((prospect.status === "audited" || prospect.status === "drafted") && !prospect.proposal) {
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
    if (!(error instanceof SiteBlockedError)) throw error;
    // Retrying will not help, and leaving it here would block the front of every batch.
    await prisma.prospect.update({
      where: { id },
      data: { status: "rejected", rejectReason: error.message, lastError: null },
    });
    return;
  }
  const findings = await reviewPage(capture);
  const screenshotPath = await saveScreenshot(id, capture.screenshot);
  await prisma.audit.upsert({
    where: { prospectId: id },
    create: {
      prospectId: id,
      pageUrl: capture.pageUrl,
      screenshotPath,
      pageText: capture.pageText,
      findings: JSON.stringify(findings),
    },
    update: {
      pageUrl: capture.pageUrl,
      screenshotPath,
      pageText: capture.pageText,
      findings: JSON.stringify(findings),
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
  const quoted = raw.match(/"message"\s*:\s*"([^"]+)"/);
  const line = (quoted?.[1] ?? raw.split("\n")[0] ?? raw).trim();
  return line.slice(0, 180);
}

export function parseFindings(raw: string): Finding[] {
  try {
    const parsed = findingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
