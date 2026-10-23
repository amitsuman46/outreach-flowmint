"use client";

import { useState } from "react";
import { IconRefresh } from "./icons";
import { announceRun } from "./run-indicator";
import { useToast } from "./toast";
import { Button } from "./ui";

/**
 * Rebuilds concept + PDF from the live site and rewrites the email, in the background.
 * Asks first, because it replaces any edits made to the draft.
 */
export function RefreshButton({
  ids,
  count,
  label,
  variant = "secondary",
  size = "md",
}: {
  ids?: string[];
  count: number;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    setConfirming(false);
    try {
      const response = await fetch("/api/prospects/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; run?: { total: number } };
      if (!response.ok) {
        toast("warn", "Not started", data.error);
        return;
      }
      if (!data.run?.total) {
        toast("info", "Nothing to refresh", "Only unsent drafts can be refreshed.");
        return;
      }
      announceRun();
      toast("info", `Refreshing ${data.run.total} ${data.run.total === 1 ? "lead" : "leads"}`, "Progress shows in the top bar.");
    } catch {
      toast("error", "Could not reach the desk server");
    } finally {
      setStarting(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ink px-3 py-2 text-[13px] text-white animate-fade-in">
        <span>
          Rebuild {count === 1 ? "the concept" : `${count} concepts`} and rewrite {count === 1 ? "the email" : "the emails"}? Edits to{" "}
          {count === 1 ? "this draft" : "drafts"} are replaced.
        </span>
        <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" className="bg-mint-500 text-ink hover:bg-mint-400" onClick={start}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => setConfirming(true)}
      loading={starting}
      disabled={count === 0}
      icon={<IconRefresh size={size === "sm" ? 13 : 15} />}
    >
      {label}
    </Button>
  );
}
