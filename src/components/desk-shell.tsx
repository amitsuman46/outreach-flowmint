import { Suspense } from "react";
import type { DeskCounts } from "@/lib/counts";
import { DeskNav } from "./desk-nav";
import { FlowMintMark, IconLogout } from "./icons";
import { InboxSync } from "./inbox-sync";
import { RunIndicator } from "./run-indicator";
import { ToastProvider } from "./toast";
import { cx } from "./ui";

export interface Readiness {
  ai: boolean;
  mail: boolean;
  netlify: boolean;
  netlifyUrl: string;
}

export function DeskShell({
  counts,
  readiness,
  children,
}: {
  counts: DeskCounts;
  readiness: Readiness;
  children: React.ReactNode;
}) {
  const checks = [
    { label: "OpenAI", ok: readiness.ai, hint: "OPENAI_API_KEY" },
    { label: "Hostinger mail", ok: readiness.mail, hint: "OUTREACH_SMTP_*" },
    { label: "Netlify", ok: readiness.netlify, hint: "NETLIFY_AUTH_TOKEN" },
  ];
  return (
    <ToastProvider>
      <div className="flex h-dvh overflow-hidden">
        <aside className="hidden w-60 shrink-0 flex-col bg-ink text-slate-100 md:flex">
          <div className="flex items-center gap-2.5 px-5 pt-6 pb-7">
            <FlowMintMark size={28} />
            <div>
              <p className="text-[15px] font-semibold tracking-tight">FlowMint</p>
              <p className="text-[11px] text-slate-500">Outreach desk</p>
            </div>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-3">
            <Suspense>
              <DeskNav counts={counts} variant="side" />
            </Suspense>
          </div>
          <div className="m-3 rounded-xl bg-white/4 p-3 ring-1 ring-white/6">
            <p className="mb-2 text-[11px] font-medium tracking-wider text-slate-500 uppercase">Connections</p>
            <ul className="space-y-1.5">
              {checks.map((check) => (
                <li key={check.label} className="flex items-center justify-between text-[12px]" title={check.ok ? "Connected" : `Add ${check.hint} to .env`}>
                  <span className="text-slate-300">{check.label}</span>
                  <span className={cx("flex items-center gap-1.5", check.ok ? "text-mint-300" : "text-amber-300")}>
                    <span className={cx("size-1.5 rounded-full", check.ok ? "bg-mint-400" : "bg-amber-400")} />
                    {check.ok ? "Ready" : "Not set"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <form action="/api/auth/logout" method="post" className="px-3 pb-4">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/4 hover:text-slate-100"
            >
              <IconLogout size={17} />
              Sign out
            </button>
          </form>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="bg-ink pt-3 md:hidden">
            <div className="flex items-center gap-2 px-4 pb-2 text-white">
              <FlowMintMark size={22} />
              <span className="text-sm font-semibold">Outreach desk</span>
            </div>
            <Suspense>
              <DeskNav counts={counts} variant="top" />
            </Suspense>
          </div>
          <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200/70 bg-[#f5f6f8]/85 px-4 backdrop-blur md:px-8">
            <div className="min-w-0 max-w-md flex-1">
              <RunIndicator />
            </div>
            <InboxSync />
          </div>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-4 py-7 pb-24 md:px-8">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
