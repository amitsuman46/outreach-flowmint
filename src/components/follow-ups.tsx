"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FollowUpJob, StepQueue } from "@/lib/followups";
import { IconAlert, IconCalendar, IconPlus, IconSend, IconTrash } from "./icons";
import { useToast } from "./toast";
import { Badge, Button, Card, CardHeader, cx, EmptyState, Notice, relativeTime, Spinner } from "./ui";

const field =
  "w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-mint-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

export interface FollowUpStepView {
  days: number;
  body: string;
}

export interface FollowUpView {
  id: string;
  step: number;
  subject: string;
  body: string;
  status: "sending" | "sent" | "failed";
  sentAt: string | null;
  error: string | null;
  updatedAt: string;
  prospect?: { id: string; company: string; name: string; email: string | null };
}

const MAX_STEPS = 4;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Polls the background send and refreshes the page as it goes. */
function useJob(initial: FollowUpJob | null) {
  const router = useRouter();
  const toast = useToast();
  const [job, setJob] = useState(initial);
  const last = useRef(initial);

  useEffect(() => {
    if (job?.status !== "running") return;
    const timer = setTimeout(async () => {
      const response = await fetch("/api/followups/job").catch(() => null);
      const data = response?.ok ? ((await response.json()) as { job: FollowUpJob | null }) : null;
      const next = data?.job ?? null;
      const prev = last.current;
      if (next && prev?.status === "running" && next.status !== "running") {
        const summary = `${next.sent} sent${next.failed ? `, ${next.failed} failed` : ""}${next.skipped ? `, ${next.skipped} skipped because they replied` : ""}.`;
        if (next.status === "error") toast("error", `Follow-up ${next.step} stopped`, `${next.error ?? ""} ${summary}`.trim());
        else if (next.status === "stopped") toast("warn", `Follow-up ${next.step} stopped`, summary);
        else toast(next.failed ? "warn" : "success", `Follow-up ${next.step} finished`, summary);
      }
      if (next && prev && next.done !== prev.done) router.refresh();
      if (next?.status !== "running") router.refresh();
      last.current = next;
      setJob(next);
    }, 2000);
    return () => clearTimeout(timer);
  }, [job, router, toast]);

  return {
    job,
    started(next: FollowUpJob) {
      last.current = next;
      setJob(next);
    },
  };
}

/** One card per step: who is due, and the button that sends to all of them. */
export function FollowUpQueues({
  queues,
  initialJob,
  mailReady,
}: {
  queues: StepQueue[];
  initialJob: FollowUpJob | null;
  mailReady: boolean;
}) {
  const toast = useToast();
  const { job, started } = useJob(initialJob);
  const [pending, setPending] = useState<number | "stop" | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const running = job?.status === "running";

  async function send(step: number) {
    setConfirming(null);
    setPending(step);
    try {
      const response = await fetch("/api/followups/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; started?: boolean; job?: FollowUpJob };
      if (!response.ok) toast("error", "Not started", data.error);
      else if (data.job) {
        if (!data.started) toast("warn", "Already sending", `Follow-up ${data.job.step} is still going out.`);
        started(data.job);
      }
    } catch {
      toast("error", "Could not reach the desk server");
    } finally {
      setPending(null);
    }
  }

  async function stop() {
    setPending("stop");
    try {
      await fetch("/api/followups/job", { method: "DELETE" });
      toast("success", "Stopping", "The email going out now finishes, then the send stops.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {running && job ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-mint-200 animate-fade-in">
          <Spinner size={16} className="shrink-0 text-mint-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-800">
              Sending follow-up {job.step} · {job.done}/{job.total || "…"}
              <span className="font-normal text-slate-500"> · {job.current ?? "starting"}</span>
            </p>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-mint-100">
              <div
                className="h-full rounded-full bg-mint-600 transition-[width] duration-500"
                style={{ width: `${Math.max(job.total ? (job.done / job.total) * 100 : 0, 5)}%` }}
              />
            </div>
          </div>
          <Button size="sm" onClick={stop} loading={pending === "stop"} disabled={pending !== null}>
            Stop
          </Button>
        </div>
      ) : null}
      {!running && job && (job.status === "error" || job.failed) ? (
        <Notice tone={job.status === "error" ? "error" : "warn"}>
          Last send of follow-up {job.step}: {job.sent} sent, {job.failed} failed.
          {job.error ? ` ${job.error}` : " Failed ones stay on the list, so sending again retries them."}
        </Notice>
      ) : null}
      {!mailReady ? <Notice tone="warn">Add the Hostinger mailbox in .env to send.</Notice> : null}

      {queues.map((queue) => {
        const count = queue.outstanding.length;
        return (
          <Card key={queue.step}>
            <CardHeader
              icon={<IconSend size={16} />}
              title={`Follow-up ${queue.step}`}
              description={`${queue.days} days after the first email${queue.step > 1 ? `, and after follow-up ${queue.step - 1} went out` : ""}.`}
              action={<Badge tone={count ? "amber" : "slate"}>{count} outstanding</Badge>}
            />
            <div className="space-y-3 p-5">
              {count ? (
                <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-100">
                  {queue.outstanding.map((lead) => (
                    <li key={lead.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3.5 py-2.5 text-[13px]">
                      <span className="min-w-0">
                        <Link href={`/desk/prospects/${lead.id}`} className="font-medium text-slate-900 hover:text-mint-700 hover:underline">
                          {lead.company}
                        </Link>
                        <span className="text-slate-500"> · {lead.name} · {lead.email}</span>
                        {lead.lastError ? (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-red-700">
                            <IconAlert size={12} /> Last try failed: {lead.lastError}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        First email {formatDate(lead.firstSentAt)} · due {relativeTime(lead.dueSince)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Nobody is due for this one right now.</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {queue.later
                    ? `${queue.later} more ${queue.later === 1 ? "becomes" : "become"} due later, the next on ${formatDate(queue.nextDue!)}.`
                    : "Nobody else is waiting for this step."}
                </p>
                {confirming === queue.step ? (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <span className="text-[13px] text-slate-700">
                      Send to {count} {count === 1 ? "lead" : "leads"}?
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => send(queue.step)} icon={<IconSend size={13} />}>
                      Yes, send
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => setConfirming(queue.step)}
                    loading={pending === queue.step}
                    disabled={!count || running || pending !== null || !mailReady}
                    icon={<IconSend size={15} />}
                  >
                    Send follow-up {queue.step} to {count}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/** The days and text for each follow-up. */
export function FollowUpSettingsCard({ initial }: { initial: FollowUpStepView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [steps, setSteps] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(steps) !== saved;

  function setStep(index: number, patch: Partial<FollowUpStepView>) {
    setSteps((list) => list.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/followups/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; settings?: { steps: FollowUpStepView[] } };
      if (!response.ok || !data.settings) {
        toast("error", "Not saved", data.error);
        return;
      }
      setSteps(data.settings.steps);
      setSaved(JSON.stringify(data.settings.steps));
      toast("success", "Follow-ups saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<IconCalendar size={16} />}
        title="Follow-up text"
        description="Sent as a reply to the first email, in the same thread. The days decide when a lead shows up as outstanding."
      />
      <div className="space-y-4 p-5">
        {steps.map((step, index) => (
          <div key={index} className="rounded-xl border border-slate-100 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-slate-800">
                Follow-up {index + 1}
                <span className="flex items-center gap-1.5 font-normal text-slate-500">
                  ·
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={step.days}
                    onChange={(event) => setStep(index, { days: Number(event.target.value) })}
                    className="h-7 w-14 rounded-lg border-0 bg-white px-2 text-center text-[13px] tabular-nums ring-1 ring-slate-200 focus:ring-2 focus:ring-mint-500 focus:outline-none"
                  />
                  days after the first email
                </span>
              </p>
              {steps.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove follow-up ${index + 1}`}
                  onClick={() => setSteps((list) => list.filter((_, i) => i !== index))}
                  icon={<IconTrash size={13} />}
                />
              ) : null}
            </div>
            <textarea
              value={step.body}
              onChange={(event) => setStep(index, { body: event.target.value })}
              rows={5}
              className={`${field} leading-6`}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            size="sm"
            onClick={() => setSteps((list) => [...list, { days: (list.at(-1)?.days ?? 0) + 4, body: "Hi {firstName},\n\n" }])}
            disabled={steps.length >= MAX_STEPS}
            icon={<IconPlus size={13} />}
          >
            Add follow-up
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          <code className="font-mono text-slate-600">{"{firstName}"}</code> and <code className="font-mono text-slate-600">{"{company}"}</code> are
          filled in for each lead. The signature and the opt-out line are added on send.
        </p>
      </div>
    </Card>
  );
}

const STATUS: Record<FollowUpView["status"], { label: string; tone: "mint" | "amber" | "red" }> = {
  sending: { label: "Check Sent folder", tone: "amber" },
  sent: { label: "Sent", tone: "mint" },
  failed: { label: "Failed", tone: "red" },
};

/** Follow-ups that went out, or tried to. */
export function FollowUpHistory({ items, empty, showLead = false }: { items: FollowUpView[]; empty: string; showLead?: boolean }) {
  if (!items.length) return <EmptyState icon={<IconCalendar size={18} />} title={empty} />;
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <HistoryRow key={item.id} item={item} showLead={showLead} />
      ))}
    </div>
  );
}

function HistoryRow({ item, showLead }: { item: FollowUpView; showLead: boolean }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[item.status];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
          <Badge tone={status.tone}>{status.label}</Badge>
          {showLead && item.prospect ? (
            <Link href={`/desk/prospects/${item.prospect.id}`} className="font-medium text-slate-900 hover:text-mint-700 hover:underline">
              {item.prospect.company}
            </Link>
          ) : null}
          <span className="text-slate-500">Follow-up {item.step}</span>
          <span className="text-slate-700">{relativeTime(item.sentAt ?? item.updatedAt)}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
          {open ? "Close" : "View"}
        </Button>
      </div>
      {item.error ? (
        <Notice tone={item.status === "failed" ? "error" : "warn"} className="mt-3">
          {item.error}
        </Notice>
      ) : null}
      {open ? (
        <div className={cx("mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] leading-6 whitespace-pre-wrap text-slate-700 animate-fade-in")}>
          <p className="mb-1 font-medium text-slate-900">{item.subject}</p>
          {item.body}
        </div>
      ) : null}
    </Card>
  );
}
