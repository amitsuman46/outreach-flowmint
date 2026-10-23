import { MailList } from "@/components/mail-list";
import { PageHeader } from "@/components/ui";
import { parseAttachments } from "@/lib/attachments";
import { mailConfig } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SentPage() {
  const [messages, copyFailures] = await Promise.all([
    prisma.inboxMessage.findMany({
      where: { direction: "out" },
      orderBy: { receivedAt: "desc" },
      include: { prospect: { select: { id: true, name: true, company: true } } },
      take: 500,
    }),
    prisma.outreachMessage.count({ where: { sentCopyError: { not: null } } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Sent items"
        description={`Everything in the Hostinger Sent folder of ${mailConfig().user || "the outreach mailbox"}, including mail sent from webmail. Updated each time mail is checked.`}
      />
      {copyFailures ? (
        <p className="mb-4 text-[13px] text-amber-700">
          {copyFailures} {copyFailures === 1 ? "email was" : "emails were"} delivered but could not be copied into the Hostinger Sent
          folder. They still appear here.
        </p>
      ) : null}
      <MailList
        empty="Nothing in the Sent folder yet."
        items={messages.map((message) => ({
          id: message.id,
          direction: "out",
          from: message.from,
          to: message.to,
          subject: message.subject,
          body: message.body,
          receivedAt: message.receivedAt.toISOString(),
          attachments: parseAttachments(message.attachments),
          prospect: message.prospect,
        }))}
      />
    </div>
  );
}
