"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconExternal, IconGlobe } from "./icons";
import { useToast } from "./toast";
import { Badge, Button, Card, CardHeader, Notice } from "./ui";

/** The one website every "Without PPT" email points to. Shared by everyone using the desk. */
export function TemplateSiteCard({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saved, setSaved] = useState(initialUrl);
  const [saving, setSaving] = useState(false);
  const dirty = url.trim() !== (saved ?? "");

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/template-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        toast("error", "Not saved", data.error);
        return;
      }
      setUrl(data.url);
      setSaved(data.url);
      toast("success", "Template site saved", "New emails and sends use this link.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<IconGlobe size={16} />}
        title="Template site"
        description="One example website for every lead in this workflow. It appears as a button in each proposal email."
        action={saved ? <Badge tone="mint">Set</Badge> : <Badge tone="amber">Needed</Badge>}
      />
      <div className="space-y-3 p-5">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://your-template-site.netlify.app"
            className="h-10 min-w-0 flex-1 rounded-xl border-0 bg-white px-3.5 font-mono text-[13px] ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-mint-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={saving} disabled={!url.trim() || !dirty}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {saved ? (
              <a
                href={saved}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300"
              >
                Open <IconExternal size={13} />
              </a>
            ) : null}
          </div>
        </form>
        {!saved ? <Notice tone="warn">Add the link before running Prepare. Every draft points to it.</Notice> : null}
        <p className="text-xs text-slate-500">
          Changing the link updates every unsent email, because the button is filled in when you preview and send.
        </p>
      </div>
    </Card>
  );
}
