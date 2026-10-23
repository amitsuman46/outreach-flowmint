"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StoredAttachment } from "@/lib/attachments";
import { IconChevronDown, IconPaperclip, IconSearch, IconSend } from "./icons";
import { Avatar } from "./prospect-table";
import { Card, cx, EmptyState, relativeTime } from "./ui";

export interface MailItem {
  id: string;
  direction: "in" | "out";
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
  attachments: StoredAttachment[];
  prospect: { id: string; name: string; company: string } | null;
}

export function MailList({ items, empty }: { items: MailItem[]; empty: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.to, item.from, item.subject, item.body, item.prospect?.name, item.prospect?.company]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q)),
    );
  }, [items, query]);

  if (!items.length) {
    return <EmptyState icon={<IconSend size={20} />} title={empty} description="Use Check mail at the top to load the Hostinger Sent folder." />;
  }

  return (
    <div className="space-y-3">
      <label className="relative block max-w-sm">
        <IconSearch size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search recipient, subject, text"
          className="h-10 w-full rounded-xl border-0 bg-white pr-3 pl-9 text-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-mint-500 focus:outline-none"
        />
      </label>
      <Card className="divide-y divide-slate-100 overflow-hidden">
        {visible.map((item) => {
          const expanded = open === item.id;
          const who = item.prospect?.name ?? (item.direction === "out" ? item.to : item.from);
          return (
            <div key={item.id} className={cx("transition-colors", expanded && "bg-slate-50/60")}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : item.id)}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50/80"
              >
                <Avatar name={who} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{who}</span>
                    {item.prospect?.company ? (
                      <span className="hidden truncate text-xs text-slate-400 sm:inline">{item.prospect.company}</span>
                    ) : null}
                  </div>
                  <p className="truncate text-[13px] text-slate-600">
                    <span className="font-medium text-slate-800">{item.subject}</span>
                    <span className="text-slate-400"> — {item.body.replace(/\s+/g, " ").slice(0, 140)}</span>
                  </p>
                </div>
                {item.attachments.length ? <IconPaperclip size={14} className="shrink-0 text-slate-400" /> : null}
                <span className="w-16 shrink-0 text-right text-xs text-slate-500" title={new Date(item.receivedAt).toLocaleString()}>
                  {relativeTime(item.receivedAt)}
                </span>
                <IconChevronDown size={15} className={cx("shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")} />
              </button>
              {expanded ? (
                <div className="px-5 pb-5 pl-17 animate-fade-in">
                  <dl className="grid gap-1 text-xs text-slate-500 sm:grid-cols-[60px_1fr]">
                    <dt>From</dt>
                    <dd className="text-slate-700">{item.from}</dd>
                    <dt>To</dt>
                    <dd className="text-slate-700">{item.to}</dd>
                    <dt>Date</dt>
                    <dd className="text-slate-700">{new Date(item.receivedAt).toLocaleString()}</dd>
                  </dl>
                  <div className="mt-3 rounded-xl bg-white p-4 text-sm leading-6 whitespace-pre-wrap text-slate-700 ring-1 ring-slate-200">
                    {item.body || "(no text)"}
                  </div>
                  {item.attachments.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {item.attachments.map((file) => (
                        <li key={file.id}>
                          <a
                            href={`/api/mail/files/${file.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300"
                          >
                            <IconPaperclip size={12} />
                            {file.name}
                            <span className="text-slate-400">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {item.prospect ? (
                    <Link
                      href={`/desk/prospects/${item.prospect.id}`}
                      className="mt-3 inline-block text-[13px] font-medium text-mint-700 hover:underline"
                    >
                      Open lead
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {visible.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing matches that search.</p>
        ) : null}
      </Card>
    </div>
  );
}
