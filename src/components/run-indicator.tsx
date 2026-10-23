"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RunView } from "@/lib/schemas";
import { useToast } from "./toast";
import { Spinner } from "./ui";

/** Fire after starting a run so the indicator polls straight away. */
export const RUN_STARTED_EVENT = "outreach:run-started";

export function announceRun() {
  window.dispatchEvent(new Event(RUN_STARTED_EVENT));
}

export function RunIndicator() {
  const router = useRouter();
  const toast = useToast();
  const [run, setRun] = useState<RunView | null>(null);
  const last = useRef<{ id: string; done: number; status: string } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    async function poll() {
      const response = await fetch("/api/runs/current").catch(() => null);
      const data = response?.ok ? ((await response.json()) as { run: RunView | null }) : null;
      const next = data?.run ?? null;
      const prev = last.current;
      if (next && prev && prev.id === next.id) {
        if (prev.status === "running" && next.status !== "running") {
          const label = next.kind === "refresh" ? "Refresh" : "Prepare";
          if (next.status === "error") toast("error", `${label} stopped`, next.error ?? undefined);
          else if (next.error) toast("warn", `${label} finished with a note`, next.error);
          else toast("success", `${label} finished`, `${next.done} of ${next.total} ${next.total === 1 ? "lead" : "leads"} done.`);
          router.refresh();
        } else if (next.done !== prev.done) {
          router.refresh();
        }
      }
      last.current = next ? { id: next.id, done: next.done, status: next.status } : null;
      setRun(next);
      if (!stopped) timer = setTimeout(poll, next?.status === "running" ? 2000 : 10000);
    }

    const kick = () => {
      clearTimeout(timer);
      void poll();
    };
    void poll();
    window.addEventListener(RUN_STARTED_EVENT, kick);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(RUN_STARTED_EVENT, kick);
    };
  }, [router, toast]);

  if (!run || run.status !== "running") return null;
  const percent = run.total ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg bg-white px-3 py-1.5 ring-1 ring-mint-200 animate-fade-in">
      <Spinner size={14} className="shrink-0 text-mint-600" />
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-slate-800">
          {run.kind === "refresh" ? "Refreshing" : "Preparing"} {run.done}/{run.total}
          <span className="font-normal text-slate-500"> · {run.step ?? "starting"}</span>
        </p>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-mint-100">
          <div className="h-full rounded-full bg-mint-600 transition-[width] duration-500" style={{ width: `${Math.max(percent, 5)}%` }} />
        </div>
      </div>
    </div>
  );
}
