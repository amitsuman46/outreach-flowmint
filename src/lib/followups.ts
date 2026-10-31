/**
 * Follow-ups: short replies sent in the same thread when a lead hasn't answered.
 * Nothing goes out on its own. The Follow-ups page lists who is outstanding for each step,
 * and a person starts the send. The desk then works through that list in the background.
 */
import { z } from "zod";
import { renderEmailHtml, renderEmailText } from "./email-template";
import { mailConfig, mailReady, recordOutgoing, sendOutreachMail, syncInbox } from "./mail";
import { ensureOptOut } from "./opt-out";
import { prisma } from "./prisma";
import { getSetting, setSetting } from "./settings";
import { signature } from "./site-config";

const DAY = 24 * 60 * 60 * 1000;
/** Gap between two sends, so a batch doesn't hit the mailbox all at once. */
const PAUSE_BETWEEN = 4_000;
/** Several failures in a row usually mean the mailbox itself (login, sending limit), so the batch stops. */
const MAX_FAILURES_IN_A_ROW = 3;

export const followUpStepSchema = z.object({
  days: z.number().int().min(1, "Wait at least one day").max(90),
  body: z.string().trim().min(1, "Write the follow-up").max(4000),
});

export const followUpSettingsSchema = z
  .object({ steps: z.array(followUpStepSchema).min(1, "Keep at least one follow-up").max(4) })
  .refine((value) => value.steps.every((step, index) => index === 0 || step.days > value.steps[index - 1].days), {
    message: "Each follow-up has to wait longer than the one before it.",
  });

export type FollowUpStep = z.infer<typeof followUpStepSchema>;
export type FollowUpSettings = z.infer<typeof followUpSettingsSchema>;

const DEFAULT_SETTINGS: FollowUpSettings = {
  steps: [
    {
      days: 3,
      body:
        "Hi {firstName},\n\nJust bringing this back to the top of your inbox in case it got buried. Happy to answer any questions about the ideas for {company}, or send a shorter version if that's easier.\n\nCheers,",
    },
    {
      days: 7,
      body:
        "Hi {firstName},\n\nI'll leave it here so I'm not cluttering your inbox. If refreshing the {company} website comes up later in the year, just reply to this email and I'll pick it up from there.\n\nAll the best,",
    },
  ],
};

const KEY = "followUps";

export async function followUpSettings(): Promise<FollowUpSettings> {
  const raw = await getSetting(KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = followUpSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveFollowUpSettings(input: unknown): Promise<FollowUpSettings> {
  const parsed = followUpSettingsSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Those settings aren't valid.");
  await setSetting(KEY, JSON.stringify(parsed.data));
  return parsed.data;
}

export function fillPlaceholders(body: string, prospect: { firstName: string; name: string; company: string }): string {
  const firstName = prospect.firstName.trim() || prospect.name.trim().split(/\s+/)[0] || "there";
  return body.replace(/\{firstName\}/g, firstName).replace(/\{company\}/g, prospect.company);
}

export interface OutstandingLead {
  id: string;
  company: string;
  name: string;
  email: string;
  /** When the first email went out. */
  firstSentAt: string;
  /** When this step became due. */
  dueSince: string;
  /** The last send of this step failed, so it's outstanding again. */
  lastError: string | null;
}

export interface StepQueue {
  step: number;
  days: number;
  outstanding: OutstandingLead[];
  /** Leads that will be due for this step later, and the earliest of those dates. */
  later: number;
  nextDue: string | null;
}

/** Who is due for each follow-up right now. Only leads still marked sent, so a reply takes them off. */
export async function followUpQueues(settings?: FollowUpSettings, now = new Date()): Promise<StepQueue[]> {
  const config = settings ?? (await followUpSettings());
  const prospects = await prisma.prospect.findMany({
    where: { status: "sent", email: { not: null } },
    include: {
      messages: { where: { status: "sent", messageId: { not: null } }, orderBy: { sentAt: "asc" }, take: 1 },
      followUps: true,
    },
    orderBy: { updatedAt: "asc" },
  });
  return config.steps.map((step, index) => {
    const number = index + 1;
    const queue: StepQueue = { step: number, days: step.days, outstanding: [], later: 0, nextDue: null };
    for (const prospect of prospects) {
      const first = prospect.messages[0]?.sentAt;
      if (!first || !prospect.email) continue;
      const own = prospect.followUps.find((row) => row.step === number);
      if (own && own.status !== "failed") continue;
      let due = first.getTime() + step.days * DAY;
      if (number > 1) {
        const previous = prospect.followUps.find((row) => row.step === number - 1);
        if (previous?.status !== "sent" || !previous.sentAt) continue;
        // Keep the gap between steps, even when the earlier one went out late.
        due = Math.max(due, previous.sentAt.getTime() + (step.days - config.steps[index - 1].days) * DAY);
      }
      if (due <= now.getTime()) {
        queue.outstanding.push({
          id: prospect.id,
          company: prospect.company,
          name: prospect.name,
          email: prospect.email,
          firstSentAt: first.toISOString(),
          dueSince: new Date(due).toISOString(),
          lastError: own?.error ?? null,
        });
      } else {
        queue.later += 1;
        if (!queue.nextDue || due < new Date(queue.nextDue).getTime()) queue.nextDue = new Date(due).toISOString();
      }
    }
    queue.outstanding.sort((a, b) => a.dueSince.localeCompare(b.dueSince));
    return queue;
  });
}

export interface FollowUpJob {
  step: number;
  status: "running" | "done" | "stopped" | "error";
  total: number;
  done: number;
  sent: number;
  failed: number;
  /** Took off the list because they replied while the batch ran. */
  skipped: number;
  current: string | null;
  error: string | null;
  startedAt: string;
}

const state = globalThis as typeof globalThis & { followUpJob?: FollowUpJob; followUpStop?: boolean };

export function followUpJob(): FollowUpJob | null {
  return state.followUpJob ?? null;
}

export function stopFollowUps(): void {
  if (state.followUpJob?.status === "running") state.followUpStop = true;
}

/** Starts sending one step to everyone outstanding for it. Returns the running job if one is already going. */
export async function startFollowUps(step: number): Promise<{ started: boolean; job: FollowUpJob | null; error?: string }> {
  if (state.followUpJob?.status === "running") return { started: false, job: state.followUpJob };
  if (!mailReady()) return { started: false, job: null, error: "Hostinger mailbox is not configured." };
  const settings = await followUpSettings();
  if (!settings.steps[step - 1]) return { started: false, job: null, error: "That follow-up isn't in the sequence." };

  const job: FollowUpJob = {
    step,
    status: "running",
    total: 0,
    done: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    current: "Checking for replies",
    error: null,
    startedAt: new Date().toISOString(),
  };
  state.followUpJob = job;
  state.followUpStop = false;
  void runJob(job, settings).catch((error) => {
    job.status = "error";
    job.error = error instanceof Error ? error.message : "The send stopped";
    job.current = null;
  });
  return { started: true, job };
}

async function runJob(job: FollowUpJob, settings: FollowUpSettings): Promise<void> {
  // Pick up replies first, so nobody who answered gets a nudge.
  const sync = await syncInbox();
  if (sync.skippedReason && !sync.skippedReason.startsWith("The sent folder was not found")) {
    throw new Error(`Couldn't check for replies, so nothing was sent: ${sync.skippedReason}`);
  }
  const queue = (await followUpQueues(settings))[job.step - 1];
  job.total = queue.outstanding.length;
  let failuresInARow = 0;

  for (const lead of queue.outstanding) {
    if (state.followUpStop) {
      job.status = "stopped";
      job.current = null;
      return;
    }
    job.current = lead.company;
    const outcome = await sendOne(lead.id, job.step, settings);
    job.done += 1;
    if (outcome === "sent") {
      job.sent += 1;
      failuresInARow = 0;
    } else if (outcome === "skipped") {
      job.skipped += 1;
      continue;
    } else {
      job.failed += 1;
      failuresInARow += 1;
      if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
        throw new Error(`Stopped after ${failuresInARow} failed sends in a row: ${outcome.error}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN));
  }
  job.status = "done";
  job.current = null;
}

async function sendOne(
  prospectId: string,
  step: number,
  settings: FollowUpSettings,
): Promise<"sent" | "skipped" | { error: string }> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: { followUps: { orderBy: { step: "asc" } } },
  });
  // Re-checked here, since a reply can arrive while the batch runs.
  if (!prospect || prospect.status !== "sent" || !prospect.email) return "skipped";
  const existing = prospect.followUps.find((row) => row.step === step);
  if (existing && existing.status !== "failed") return "skipped";
  const thread = await prisma.outreachMessage.findFirst({
    where: { prospectId, status: "sent", messageId: { not: null } },
    orderBy: { sentAt: "asc" },
  });
  if (!thread?.messageId) return "skipped";

  const references = [
    thread.messageId,
    ...prospect.followUps.flatMap((row) => (row.step < step && row.status === "sent" && row.messageId ? [row.messageId] : [])),
  ];
  const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
  const body = ensureOptOut(fillPlaceholders(settings.steps[step - 1].body, prospect));
  const parts = { body, signature: signature() };
  const text = renderEmailText(parts);

  const row = await prisma.followUp.upsert({
    where: { prospectId_step: { prospectId, step } },
    create: { prospectId, step, subject, body, status: "sending" },
    update: { subject, body, status: "sending", error: null },
  });
  try {
    const sent = await sendOutreachMail({
      to: prospect.email,
      subject,
      text,
      html: renderEmailHtml(parts),
      inReplyTo: references.at(-1),
      references,
    });
    const sentAt = new Date();
    await prisma.followUp.update({
      where: { id: row.id },
      data: { status: "sent", messageId: sent.messageId, sentAt, error: sent.warning ?? null },
    });
    await recordOutgoing({
      prospectId,
      from: mailConfig().user,
      to: prospect.email,
      subject,
      text,
      attachments: [],
      messageId: sent.messageId,
      sentAt,
    });
    return "sent";
  } catch (error) {
    const reason = (error instanceof Error ? error.message : "Send failed").slice(0, 500);
    await prisma.followUp.update({ where: { id: row.id }, data: { status: "failed", error: reason } });
    return { error: reason };
  }
}
