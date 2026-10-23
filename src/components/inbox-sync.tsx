"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconRefresh } from "./icons";
import { useToast } from "./toast";
import { cx, relativeTime } from "./ui";

export function InboxSync() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [, tick] = useState(0);
  const busy = useRef(false);

  async function sync(quiet: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/inbox/sync", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        imported?: number;
        skippedReason?: string;
        error?: string;
      };
      if (!response.ok) {
        if (!quiet) toast("error", "Could not read the mailbox", data.error);
        return;
      }
      setCheckedAt(new Date());
      if (data.skippedReason) {
        if (!quiet) toast("warn", "Mailbox check skipped", data.skippedReason);
        return;
      }
      if (data.imported) {
        toast("success", `Loaded ${data.imported} message${data.imported === 1 ? "" : "s"} from Hostinger`);
        router.refresh();
      } else if (!quiet) {
        toast("info", "No new mail");
      }
    } catch {
      if (!quiet) toast("error", "Could not reach the desk server");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  useEffect(() => {
    void sync(true);
    const timer = setInterval(() => void sync(true), 60_000);
    const clock = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
    // Poll while the desk is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-[12px] text-slate-500 sm:inline">
        {pending ? "Checking Hostinger…" : checkedAt ? `Mail checked ${relativeTime(checkedAt)}` : ""}
      </span>
      <button
        type="button"
        onClick={() => sync(false)}
        disabled={pending}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-slate-700 ring-1 ring-slate-200 transition hover:ring-slate-300 disabled:opacity-60"
      >
        <IconRefresh size={14} className={cx(pending && "animate-spin")} />
        Check mail
      </button>
    </div>
  );
}
