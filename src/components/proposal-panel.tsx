"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProposalView } from "@/lib/schemas";
import { IconExternal, IconEye, IconFile, IconGlobe, IconRefresh, IconSparkles } from "./icons";
import { useToast } from "./toast";
import { Badge, Button, buttonClass, Card, CardHeader, cx, Notice, relativeTime, Skeleton } from "./ui";

const BUILD_STEPS = [
  "Opening their homepage",
  "Measuring the site on desktop and phone",
  "Writing drawbacks, improvements and results",
  "Filling in the concept template",
  "Rendering the concept and PDF",
  "Publishing to Netlify",
];

const AREA_LABEL: Record<string, string> = {
  seo: "Search",
  design: "Design",
  ux: "Usability",
  mobile: "Mobile",
  conversion: "Bookings",
  content: "Content",
};

export function ProposalPanel({
  prospectId,
  proposal,
  canBuild,
  netlifyReady,
}: {
  prospectId: string;
  proposal: ProposalView | null;
  canBuild: boolean;
  netlifyReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [building, setBuilding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState<"drawbacks" | "improvements" | "results">("drawbacks");

  useEffect(() => {
    if (!building) return;
    setStep(0);
    const timer = setInterval(() => setStep((n) => Math.min(n + 1, BUILD_STEPS.length - 1)), 7000);
    return () => clearInterval(timer);
  }, [building]);

  async function build() {
    setBuilding(true);
    try {
      const response = await fetch(`/api/prospects/${prospectId}/proposal`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!response.ok) {
        toast("error", "Could not build the proposal", data.error);
        return;
      }
      if (data.warning) toast("warn", "Proposal built", data.warning);
      else toast("success", "Concept page and PDF are live");
      router.refresh();
    } catch {
      toast("error", "Could not reach the desk server");
    } finally {
      setBuilding(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const response = await fetch("/api/site/deploy", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) toast("error", "Publishing failed", data.error);
      else toast("success", "Concept site published");
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  const live = proposal && !proposal.needsDeploy;
  const list =
    tab === "drawbacks"
      ? proposal?.content.drawbacks.map((item) => ({ title: item.title, text: item.detail, note: item.impact, chip: AREA_LABEL[item.area] ?? item.area }))
      : tab === "improvements"
        ? proposal?.content.improvements.map((item) => ({ title: item.title, text: item.detail, note: item.fixes ? `Fixes: ${item.fixes}` : "", chip: "" }))
        : proposal?.content.results.map((item) => ({ title: item.title, text: item.text, note: "", chip: "" }));

  return (
    <Card>
      <CardHeader
        icon={<IconGlobe size={16} />}
        title="Concept and proposal"
        description="Their details on the concept site template, plus a PDF on drawbacks, improvements and expected results."
        action={
          proposal ? (
            live ? (
              <Badge tone="mint">Live</Badge>
            ) : (
              <Badge tone="amber">Not published</Badge>
            )
          ) : null
        }
      />
      <div className="p-5">
        {building ? (
          <div className="animate-fade-in">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-mint-100">
              <div className="indeterminate rounded-full bg-mint-600" />
            </div>
            <ul className="mt-4 space-y-2">
              {BUILD_STEPS.map((label, index) => (
                <li
                  key={label}
                  className={cx(
                    "flex items-center gap-2.5 text-[13px] transition-colors",
                    index < step ? "text-slate-400" : index === step ? "font-medium text-slate-900" : "text-slate-300",
                  )}
                >
                  <span
                    className={cx(
                      "size-1.5 rounded-full",
                      index < step ? "bg-mint-500" : index === step ? "animate-pulse bg-mint-600" : "bg-slate-200",
                    )}
                  />
                  {label}
                </li>
              ))}
            </ul>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <p className="mt-3 text-xs text-slate-500">This usually takes 30 to 60 seconds.</p>
          </div>
        ) : proposal ? (
          <div className="space-y-4 animate-fade-in">
            {proposal.content.summary ? (
              <p className="text-[13px] leading-6 text-slate-600">{proposal.content.summary}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {live ? (
                <a href={proposal.demoUrl} target="_blank" rel="noreferrer" className={buttonClass("primary", "sm")}>
                  <IconExternal size={13} />
                  Open concept
                </a>
              ) : null}
              <a
                href={`/api/demo/index.html?for=${encodeURIComponent(proposal.slug)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary", "sm")}
              >
                <IconEye size={13} />
                Preview locally
              </a>
              {proposal.hasPdf ? (
                <a href={`/api/prospects/${prospectId}/proposal`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                  <IconFile size={13} />
                  Open PDF
                </a>
              ) : null}
              {!live && netlifyReady ? (
                <Button size="sm" variant="secondary" onClick={publish} loading={publishing}>
                  Publish
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={build} disabled={!canBuild} icon={<IconRefresh size={13} />}>
                Rebuild
              </Button>
            </div>
            {live ? (
              <p className="truncate font-mono text-xs text-slate-500" title={proposal.demoUrl}>
                {proposal.demoUrl.replace(/^https:\/\//, "")}
              </p>
            ) : null}
            {proposal.placeholders.length ? (
              <Notice tone="warn">
                The concept still shows placeholders for {proposal.placeholders.join(", ")}, because their site doesn&apos;t list
                them. Check before sending.
              </Notice>
            ) : null}
            {proposal.deployError ? <Notice tone="error">{proposal.deployError}</Notice> : null}
            {!netlifyReady ? (
              <Notice tone="warn">Add NETLIFY_AUTH_TOKEN to .env to publish. You can still preview locally and attach the PDF.</Notice>
            ) : null}

            <div>
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                {(["drawbacks", "improvements", "results"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={cx(
                      "flex-1 rounded-lg px-2 py-1.5 text-[13px] font-medium capitalize transition",
                      tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    {key}
                    <span className="ml-1 text-slate-400 tabular-nums">{proposal.content[key].length}</span>
                  </button>
                ))}
              </div>
              <ul className="mt-3 space-y-2">
                {(list ?? []).map((item, index) => (
                  <li key={`${tab}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 animate-fade-in">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-slate-900">{item.title}</p>
                      {item.chip ? <Badge tone="red" className="shrink-0">{item.chip}</Badge> : null}
                    </div>
                    <p className="mt-1 text-[13px] leading-5 text-slate-600">{item.text}</p>
                    {item.note ? <p className="mt-1.5 text-xs leading-5 text-slate-500">{item.note}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-400">Built {relativeTime(proposal.builtAt)}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="grid size-11 place-items-center rounded-xl bg-mint-50 text-mint-700 ring-1 ring-mint-100">
              <IconSparkles size={20} />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-800">No concept yet</p>
            <p className="mt-1 max-w-xs text-[13px] leading-5 text-slate-500">
              {canBuild
                ? "Build a concept homepage and a PDF proposal from the site review."
                : "Run Prepare first. A site review is needed before building a concept."}
            </p>
            <Button variant="primary" className="mt-4" onClick={build} disabled={!canBuild} icon={<IconSparkles size={15} />}>
              Build concept and PDF
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
