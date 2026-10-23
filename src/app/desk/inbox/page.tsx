import Link from "next/link";
import { ComposeMail } from "@/components/compose-mail";
import { IconInbox, IconPaperclip } from "@/components/icons";
import { Avatar } from "@/components/prospect-table";
import { Badge, Card, cx, EmptyState, PageHeader, relativeTime } from "@/components/ui";
import { parseAttachments } from "@/lib/attachments";
import { mailConfig, mailReady } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const messages = await prisma.inboxMessage.findMany({
    orderBy: { receivedAt: "desc" },
    include: { prospect: true },
    take: 300,
  });
  const groups = new Map<
    string,
    {
      prospectId: string | null;
      name: string;
      company: string;
      latest: number;
      hasReply: boolean;
      messages: typeof messages;
    }
  >();

  for (const message of messages) {
    const other = message.direction === "out" ? firstAddress(message.to) : firstAddress(message.from);
    const key = other || message.from;
    const existing = groups.get(key);
    if (existing) {
      existing.messages.push(message);
      if (message.direction === "in") existing.hasReply = true;
      continue;
    }
    const matched = message.prospect && (message.prospect.email ?? "").toLowerCase() === key;
    groups.set(key, {
      prospectId: matched ? message.prospectId : null,
      name: matched ? message.prospect?.name ?? key : key,
      company: matched ? message.prospect?.company ?? "" : "",
      latest: message.receivedAt.getTime(),
      hasReply: message.direction === "in",
      messages: [message],
    });
  }

  const threads = [...groups.values()].sort((a, b) => b.latest - a.latest);

  return (
    <div>
      <PageHeader
        title="Mail"
        description="Conversations from the Hostinger inbox and Sent folder, grouped by person. Replies from leads mark them as replied."
        action={<ComposeMail from={mailConfig().user || "your Hostinger address"} ready={mailReady()} />}
      />
      {threads.length === 0 ? (
        <EmptyState
          icon={<IconInbox size={20} />}
          title="No mail stored yet"
          description="Use Check mail at the top to pull the inbox and Sent folder."
        />
      ) : (
        <div className="space-y-3">
          {threads.map((thread, index) => (
            <Card
              key={`${thread.prospectId ?? thread.name}`}
              className="overflow-hidden animate-slide-up"
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            >
              <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
                <Avatar name={thread.name} />
                <div className="min-w-0 flex-1">
                  {thread.prospectId ? (
                    <Link href={`/desk/prospects/${thread.prospectId}`} className="font-medium text-slate-900 hover:text-mint-700">
                      {thread.name}
                    </Link>
                  ) : (
                    <p className="truncate font-medium text-slate-900">{thread.name}</p>
                  )}
                  {thread.company ? <p className="text-xs text-slate-500">{thread.company}</p> : null}
                </div>
                {thread.hasReply ? <Badge tone="mint">Replied</Badge> : null}
                <span className="text-xs text-slate-400">{thread.messages.length} {thread.messages.length === 1 ? "message" : "messages"}</span>
              </header>
              <ul className="divide-y divide-slate-100">
                {[...thread.messages].reverse().map((message) => {
                  const files = parseAttachments(message.attachments);
                  const inbound = message.direction === "in";
                  return (
                    <li key={message.id} className={cx("px-5 py-4", inbound && "bg-mint-50/40")}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <Badge tone={inbound ? "mint" : "slate"}>{inbound ? "Received" : "Sent"}</Badge>
                        <span>{inbound ? `from ${message.from}` : `to ${message.to}`}</span>
                        <span className="ml-auto" title={message.receivedAt.toLocaleString()}>
                          {relativeTime(message.receivedAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-900">{message.subject}</p>
                      <p className="mt-1 line-clamp-12 text-sm leading-6 whitespace-pre-wrap text-slate-600">{message.body}</p>
                      {files.length > 0 ? (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {files.map((file) => (
                            <li key={file.id}>
                              <a
                                href={`/api/mail/files/${file.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300"
                              >
                                <IconPaperclip size={12} />
                                {file.name}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function firstAddress(value: string): string {
  return value.split(",")[0]?.trim().toLowerCase() ?? "";
}
