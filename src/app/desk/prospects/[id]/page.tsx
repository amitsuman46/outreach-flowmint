import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowUpHistory } from "@/components/follow-ups";
import { IconArrowLeft, IconMail } from "@/components/icons";
import { ProspectEditor } from "@/components/prospect-editor";
import { RefreshButton } from "@/components/refresh-button";
import { Avatar } from "@/components/prospect-table";
import { StatusBadge } from "@/components/ui";
import { mailReady } from "@/lib/mail";
import { toDetail } from "@/lib/present";
import { prisma } from "@/lib/prisma";
import { templateSiteUrl } from "@/lib/settings";
import { netlifyReady, signature } from "@/lib/site-config";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export default async function ProspectPage({ params }: Context) {
  const { id } = await params;
  const prospect = await prisma.prospect.findUnique({
    where: { id },
    include: {
      audit: true,
      proposal: true,
      messages: { orderBy: { createdAt: "desc" } },
      followUps: { orderBy: { step: "asc" } },
    },
  });
  if (!prospect) notFound();
  const detail = toDetail(prospect);
  const template = detail.mode === "template";
  const back = detail.status === "rejected" ? "/desk/rejected" : template ? "/desk/template/leads" : "/desk/gathered";
  const templateUrl = template ? await templateSiteUrl() : null;

  return (
    <div>
      <Link href={back} className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-900">
        <IconArrowLeft size={14} />
        {detail.status === "rejected" ? "Rejected" : template ? "Leads · Without PPT" : "Leads · With PPT"}
      </Link>
      <header className="mt-4 mb-6 flex flex-wrap items-center gap-4 animate-fade-in">
        <Avatar name={detail.company} className="size-12 rounded-2xl text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">{detail.company}</h1>
            <StatusBadge status={detail.status} />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{detail.name}</span>
            {detail.title ? <span>· {detail.title}</span> : null}
            {detail.email ? (
              <span className="inline-flex items-center gap-1">
                · <IconMail size={13} /> {detail.email}
              </span>
            ) : null}
          </p>
        </div>
        {detail.status === "drafted" && detail.audit ? (
          <RefreshButton
            ids={[detail.id]}
            mode={detail.mode}
            count={1}
            label={template ? "Rewrite with latest" : "Refresh with latest"}
          />
        ) : null}
      </header>
      {detail.rejectReason ? (
        <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">{detail.rejectReason}</p>
      ) : null}
      <ProspectEditor
        prospect={detail}
        mailReady={mailReady()}
        netlifyReady={netlifyReady()}
        signature={signature()}
        templateUrl={templateUrl}
      />
      {prospect.followUps.length ? (
        <section className="mt-8">
          <h2 className="mb-1 text-[15px] font-semibold text-slate-900">Follow-ups</h2>
          <p className="mb-3 text-[13px] text-slate-500">
            Replies to the first email, sent from the{" "}
            <Link href="/desk/followups" className="font-medium text-mint-700 hover:underline">
              Follow-ups
            </Link>{" "}
            page.
          </p>
          <FollowUpHistory
            empty="No follow-ups."
            items={prospect.followUps.map((row) => ({
              id: row.id,
              step: row.step,
              subject: row.subject,
              body: row.body,
              status: row.status as "sending" | "sent" | "failed",
              sentAt: row.sentAt?.toISOString() ?? null,
              error: row.error,
              updatedAt: row.updatedAt.toISOString(),
            }))}
          />
        </section>
      ) : null}
    </div>
  );
}
