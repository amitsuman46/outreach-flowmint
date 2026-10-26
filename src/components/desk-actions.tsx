"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { PREPARE_BATCH } from "@/lib/constants";
import type { LeadMode, RunView } from "@/lib/schemas";
import { IconCheck, IconFile, IconSparkles, IconUpload } from "./icons";
import { announceRun } from "./run-indicator";
import { useToast } from "./toast";
import { Button, Card, CardHeader, cx, Notice } from "./ui";

interface ImportResult {
  created: number;
  updated: number;
  rejected: number;
  skipped: number;
  otherList?: number;
}

export function UploadCard({ mode = "ppt" }: { mode?: LeadMode }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function pick(next: File | null | undefined) {
    if (!next) return;
    if (!/\.(xlsx|xls|csv)$/i.test(next.name)) {
      toast("error", "Upload an Excel or CSV file");
      return;
    }
    setFile(next);
    setResult(null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0]);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("mode", mode);
    try {
      const response = await fetch("/api/prospects/import", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as ImportResult & { error?: string };
      if (!response.ok) {
        toast("error", "Upload failed", data.error);
        return;
      }
      setResult(data);
      setFile(null);
      if (input.current) input.current.value = "";
      toast(
        "success",
        `Imported ${data.created + data.updated} people`,
        `${data.created} new, ${data.updated} updated${
          data.otherList ? `, ${data.otherList} already in progress in the other workflow` : ""
        }`,
      );
      router.refresh();
    } catch {
      toast("error", "Upload failed", "Could not reach the desk server.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<IconUpload size={16} />}
        title="Import leads"
        description="Apollo export as Excel or CSV. Re-uploading updates people instead of duplicating them."
      />
      <div className="p-5">
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors",
            dragging ? "border-mint-500 bg-mint-50" : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50",
          )}
        >
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(event) => pick(event.target.files?.[0])}
          />
          {file ? (
            <>
              <span className="grid size-10 place-items-center rounded-xl bg-mint-100 text-mint-700">
                <IconFile size={18} />
              </span>
              <p className="mt-2.5 max-w-full truncate text-sm font-medium text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB · click to choose another</p>
            </>
          ) : (
            <>
              <span className="grid size-10 place-items-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-200">
                <IconUpload size={18} />
              </span>
              <p className="mt-2.5 text-sm font-medium text-slate-800">Drop your Apollo export here</p>
              <p className="text-xs text-slate-500">or click to browse · .xlsx, .xls, .csv up to 10 MB</p>
            </>
          )}
        </label>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {result
              ? `Added ${result.created} · updated ${result.updated} · rejected ${result.rejected} · skipped ${result.skipped}`
              : "Missing emails and websites are rejected on import."}
          </p>
          <Button variant="primary" onClick={upload} disabled={!file} loading={uploading} icon={<IconUpload size={15} />}>
            {uploading ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

const STEPS: Record<LeadMode, string[]> = {
  ppt: ["Fit check", "Site review", "Concept + PDF", "Draft"],
  template: ["Fit check", "Site review", "Proposal email"],
};

function stepIndex(step: string | null, mode: LeadMode): number {
  if (!step) return -1;
  if (step.startsWith("Checking fit")) return 0;
  if (step.startsWith("Reviewing")) return 1;
  if (mode === "template") return step.startsWith("Drafting") || step.startsWith("Rewriting") ? 2 : -1;
  if (step.startsWith("Building") || step.startsWith("Publishing")) return 2;
  if (step.startsWith("Drafting")) return 3;
  return -1;
}

export function PrepareCard({
  initialRun,
  aiReady,
  waiting,
  mode = "ppt",
  blocked,
}: {
  initialRun: RunView | null;
  aiReady: boolean;
  waiting: number;
  mode?: LeadMode;
  /** Shown instead of starting, e.g. when the template site link is missing. */
  blocked?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [run, setRun] = useState(initialRun);
  const [starting, setStarting] = useState(false);
  const busy = run?.status === "running";

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(async () => {
      const response = await fetch("/api/runs/current").catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json()) as { run: RunView | null };
      setRun(data.run);
      // The top-bar run indicator announces completion and refreshes the page.
    }, 1500);
    return () => clearInterval(timer);
  }, [busy]);

  async function start() {
    setStarting(true);
    try {
      const response = await fetch("/api/prospects/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await response.json().catch(() => ({}))) as { run?: RunView; error?: string };
      if (!response.ok || !data.run) {
        toast("error", "Could not start Prepare", data.error);
        return;
      }
      setRun(data.run);
      announceRun();
      if (data.run.total === 0) toast("info", "Nobody is waiting to be prepared");
    } finally {
      setStarting(false);
    }
  }

  const percent = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  // Results of the last run only belong on the card of the workflow it ran in.
  const ownRun = run?.mode === mode ? run : null;
  const current = stepIndex(run?.step ?? null, run?.mode ?? mode);
  const steps = STEPS[run?.mode ?? mode];

  return (
    <Card>
      <CardHeader
        icon={<IconSparkles size={16} />}
        title="Prepare"
        description={
          mode === "template"
            ? `Fit check, site review and a custom proposal email for the next ${PREPARE_BATCH}. Nothing is sent.`
            : `Fit check, site review, concept page, PDF and draft for the next ${PREPARE_BATCH}. Nothing is sent.`
        }
        action={
          <Button
            variant="primary"
            onClick={start}
            disabled={busy || !aiReady || waiting === 0 || Boolean(blocked)}
            loading={starting}
            icon={<IconSparkles size={15} />}
          >
            {busy ? (run?.kind === "refresh" ? "Refreshing…" : "Running…") : `Prepare next ${Math.min(PREPARE_BATCH, waiting) || PREPARE_BATCH}`}
          </Button>
        }
      />
      <div className="p-5">
        {busy && run ? (
          <div className="animate-fade-in">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-800">
                {run.done} of {run.total} done
              </span>
              <span className="text-xs text-slate-500 tabular-nums">{percent}%</span>
            </div>
            <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="progress-active h-full rounded-full bg-mint-600 transition-[width] duration-500"
                style={{ width: `${Math.max(percent, 6)}%` }}
              />
            </div>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-600">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-mint-500" />
              </span>
              {run.step ?? "Starting…"}
            </p>
            <ol className={cx("mt-4 grid gap-2", steps.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
              {steps.map((label, index) => (
                <li
                  key={label}
                  className={cx(
                    "rounded-lg px-2 py-1.5 text-center text-[11px] font-medium ring-1 ring-inset transition-colors",
                    index === current
                      ? "bg-mint-50 text-mint-800 ring-mint-200"
                      : "bg-white text-slate-400 ring-slate-100",
                  )}
                >
                  {label}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{waiting}</span>
              <span className="text-[13px] leading-5 text-slate-500">
                {waiting === 1 ? "lead is" : "leads are"} waiting
                {mode === "ppt" ? ", including drafts that still need a concept page." : " for a fit check, site review and proposal email."}
              </span>
            </div>
            {!aiReady ? <Notice tone="warn">Add OPENAI_API_KEY to .env before Prepare can run.</Notice> : null}
            {blocked ? <Notice tone="warn">{blocked}</Notice> : null}
            {ownRun?.status === "error" && ownRun.error ? <Notice tone="error">{ownRun.error}</Notice> : null}
            {ownRun?.status === "done" && ownRun.error ? <Notice tone="warn">{ownRun.error}</Notice> : null}
            {ownRun?.status === "done" && !ownRun.error && ownRun.total > 0 ? (
              <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
                <IconCheck size={14} className="text-mint-600" /> Last run prepared {ownRun.done} of {ownRun.total}.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
