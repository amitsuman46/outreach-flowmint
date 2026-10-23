"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconExternal, IconGlobe } from "./icons";
import { useToast } from "./toast";
import { Badge, Button, Card, CardHeader, Notice, relativeTime } from "./ui";

export function SiteCard({
  ready,
  baseUrl,
  total,
  pending,
  lastDeploy,
  lastError,
}: {
  ready: boolean;
  baseUrl: string;
  total: number;
  pending: number;
  lastDeploy: string | null;
  lastError: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);

  async function publish() {
    setPublishing(true);
    try {
      const response = await fetch("/api/site/deploy", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast("error", "Publishing failed", data.error);
        return;
      }
      toast("success", "Concept site published", baseUrl);
      router.refresh();
    } finally {
      setPublishing(false);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<IconGlobe size={16} />}
        title="Concept site"
        description="Your template on Netlify. Each lead is a ?for= entry added by the desk, and your own entries are never changed."
        action={
          ready ? (
            <Button
              onClick={publish}
              loading={publishing}
              disabled={total === 0}
              variant={pending ? "primary" : "secondary"}
              size="sm"
            >
              {publishing ? "Publishing…" : pending ? `Publish ${pending}` : "Republish"}
            </Button>
          ) : null
        }
      />
      <div className="space-y-3 p-5">
        <a
          href={baseUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 font-mono text-[13px] text-slate-700 hover:bg-slate-100"
        >
          <span className="truncate">{baseUrl.replace(/^https:\/\//, "")}</span>
          <IconExternal size={14} className="shrink-0 text-slate-400" />
        </a>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="slate">{total} {total === 1 ? "practice" : "practices"} from the desk</Badge>
          {pending ? <Badge tone="amber">{pending} not published</Badge> : total ? <Badge tone="mint">All live</Badge> : null}
          {lastDeploy ? <Badge tone="slate">Published {relativeTime(lastDeploy)}</Badge> : null}
        </div>
        {!ready ? (
          <Notice tone="warn">
            Add <code className="font-mono">NETLIFY_AUTH_TOKEN</code> to .env (Netlify → User settings → Applications →
            Personal access tokens). The site is created for you on the free plan.
          </Notice>
        ) : null}
        {lastError ? <Notice tone="error">{lastError}</Notice> : null}
      </div>
    </Card>
  );
}
