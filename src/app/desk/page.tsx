import { PrepareCard, UploadCard } from "@/components/desk-actions";
import { IconInbox, IconPencil, IconSend, IconUsers } from "@/components/icons";
import { ProspectTable } from "@/components/prospect-table";
import { SiteCard } from "@/components/site-card";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import Link from "next/link";
import { aiReady } from "@/lib/ai";
import { STATUS_LABEL } from "@/lib/labels";
import { currentRun } from "@/lib/pipeline";
import { deskCounts, toListItem } from "@/lib/present";
import { prisma } from "@/lib/prisma";
import type { ProspectStatus } from "@/lib/schemas";
import { demoBaseUrl, netlifyReady } from "@/lib/site-config";

export const dynamic = "force-dynamic";

const FUNNEL: { status: ProspectStatus; color: string }[] = [
  { status: "imported", color: "bg-slate-300" },
  { status: "fit", color: "bg-sky-400" },
  { status: "audited", color: "bg-violet-400" },
  { status: "drafted", color: "bg-amber-400" },
  { status: "sent", color: "bg-mint-500" },
  { status: "replied", color: "bg-emerald-600" },
  { status: "rejected", color: "bg-red-300" },
];

export default async function DeskPage() {
  const [counts, run, recent, grouped, waiting, proposals] = await Promise.all([
    deskCounts(),
    currentRun(),
    prisma.prospect.findMany({
      where: { status: { in: ["imported", "fit", "audited", "drafted"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { proposal: { select: { id: true } } },
    }),
    prisma.prospect.groupBy({ by: ["status"], _count: true }),
    prisma.prospect.count({
      where: {
        OR: [{ status: { in: ["imported", "fit", "audited"] } }, { status: "drafted", proposal: null }],
      },
    }),
    prisma.proposal.findMany({ select: { builtAt: true, deployedAt: true, deployError: true } }),
  ]);
  const byStatus = new Map(grouped.map((row) => [row.status, row._count]));
  const pending = proposals.filter((item) => !item.deployedAt || item.deployedAt < item.builtAt);
  const lastDeploy = proposals
    .map((item) => item.deployedAt)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const stats = [
    { href: "/desk/gathered", label: "Leads in play", value: counts.gathered, icon: IconUsers, hint: `${counts.total} on file` },
    { href: "/desk/gathered", label: "Drafts to review", value: counts.drafted, icon: IconPencil, hint: "Waiting for approval" },
    { href: "/desk/sent", label: "Contacted", value: counts.contacted, icon: IconSend, hint: `${counts.sent} in Sent folder` },
    { href: "/desk/inbox", label: "Replies", value: counts.replies, icon: IconInbox, hint: "Received mail" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Import leads, let Prepare build a concept page, PDF and draft for each, then review and send."
        action={
          counts.drafted ? (
            <ButtonLink href="/desk/gathered" variant="primary" icon={<IconPencil size={15} />}>
              Review {counts.drafted} {counts.drafted === 1 ? "draft" : "drafts"}
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Link
            key={stat.label}
            href={stat.href}
            style={{ animationDelay: `${index * 40}ms` }}
            className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md animate-slide-up"
          >
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-slate-500">{stat.label}</p>
              <stat.icon size={16} className="text-slate-400 transition-colors group-hover:text-mint-600" />
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-400">{stat.hint}</p>
          </Link>
        ))}
      </div>

      {counts.total ? (
        <Card className="p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold text-slate-900">Pipeline</h2>
            <p className="text-xs text-slate-500">{counts.total} people</p>
          </div>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {FUNNEL.map(({ status, color }) => {
              const value = byStatus.get(status) ?? 0;
              if (!value) return null;
              return (
                <div
                  key={status}
                  className={`${color} transition-all`}
                  style={{ width: `${(value / counts.total) * 100}%` }}
                  title={`${STATUS_LABEL[status]}: ${value}`}
                />
              );
            })}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {FUNNEL.map(({ status, color }) => (
              <li key={status} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`size-2 rounded-full ${color}`} />
                {STATUS_LABEL[status]}
                <span className="font-medium text-slate-800 tabular-nums">{byStatus.get(status) ?? 0}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <UploadCard />
        <PrepareCard initialRun={run} aiReady={aiReady()} waiting={waiting} />
      </div>

      <SiteCard
        ready={netlifyReady()}
        baseUrl={demoBaseUrl()}
        total={proposals.length}
        pending={pending.length}
        lastDeploy={lastDeploy?.toISOString() ?? null}
        lastError={pending.find((item) => item.deployError)?.deployError ?? null}
      />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-slate-900">Recently updated</h2>
          <Link href="/desk/gathered" className="text-[13px] font-medium text-mint-700 hover:underline">
            View all leads
          </Link>
        </div>
        <ProspectTable
          rows={recent.map(toListItem)}
          extra={Object.fromEntries(recent.map((row) => [row.id, { hasProposal: Boolean(row.proposal) }]))}
          empty="Import an Apollo export to start."
        />
      </section>
    </div>
  );
}
