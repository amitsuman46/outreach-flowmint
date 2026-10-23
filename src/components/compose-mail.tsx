"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { IconPaperclip, IconPlus, IconSend, IconX } from "./icons";
import { useToast } from "./toast";
import { Button, Card, Notice } from "./ui";

const field =
  "w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-mint-500 focus:outline-none";

export function ComposeMail({ from, ready }: { from: string; ready: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    setPending(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    data.delete("files");
    for (const file of files) data.append("files", file);
    data.set("withSignature", (form.elements.namedItem("signature") as HTMLInputElement)?.checked ? "1" : "0");
    try {
      const response = await fetch("/api/mail/send", { method: "POST", body: data });
      const result = (await response.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!response.ok) {
        toast("error", "Could not send that email", result.error);
        return;
      }
      form.reset();
      setFiles([]);
      setOpen(false);
      if (result.warning) toast("warn", "Sent, with a note", result.warning);
      else toast("success", "Sent from your Hostinger mailbox");
      router.refresh();
    } catch {
      toast("error", "Could not reach the desk server");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setOpen(true)}>
        New message
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center animate-fade-in">
      <Card className="w-full max-w-2xl shadow-2xl animate-slide-up">
        <form onSubmit={onSubmit}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">New message</h2>
              <p className="text-xs text-slate-500">From {from}. Can go to anyone, not only a lead.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <IconX size={16} />
            </button>
          </div>
          <div className="space-y-3 p-5">
            {!ready ? <Notice tone="warn">Add the Hostinger mailbox in .env before sending.</Notice> : null}
            <input name="to" type="text" required placeholder="To: name@company.com, another@company.com" className={field} />
            <input name="subject" required placeholder="Subject" className={field} />
            <textarea name="body" required rows={9} placeholder="Write your message…" className={`${field} leading-6`} />
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                <IconPaperclip size={14} />
                Attach files
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => setFiles((list) => [...list, ...Array.from(event.target.files ?? [])].slice(0, 8))}
                />
              </label>
              {files.map((file, index) => (
                <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  {file.name}
                  <button type="button" onClick={() => setFiles((list) => list.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>
                    <IconX size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
            <label className="flex items-center gap-2 text-[13px] text-slate-600">
              <input name="signature" type="checkbox" defaultChecked className="size-4 rounded accent-mint-700" />
              Add FlowMint signature
            </label>
            <div className="flex gap-2">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={pending} disabled={!ready} icon={<IconSend size={15} />}>
                {pending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
