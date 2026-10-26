import Link from "next/link";
import { PrepareCard, UploadCard } from "@/components/desk-actions";
import { IconInbox, IconPencil, IconSend, IconUsers } from "@/components/icons";
import { ProspectTable } from "@/components/prospect-table";
import { TemplateSiteCard } from "@/components/template-site-card";
import { ButtonLink, PageHeader } from "@/components/ui";
import { aiReady } from "@/lib/ai";
import { currentRun, waitingWhere } from "@/lib/pipeline";
import { deskCounts, toListItem } from "@/lib/present";
import { prisma } from "@/lib/prisma";
import { templateSiteUrl } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function TemplateOverviewPage() {
  const [counts, run, recent, grouped, waiting, siteUrl] = await Promise.all([
    deskCounts(),
    currentRun(),
    prisma.prospect.findMany({
      where: { mode: "template", status: { in: ["imported", "fit", "audited", "drafted"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.prospect.groupBy({ by: ["status"], where: { mode: "template" }, _count: true }),
    prisma.prospect.count({ where: waitingWhere("template") }),
    templateSiteUrl(),
  ]);
  const byStatus = new Map(grouped.map((row) => [row.status, row._count]));
  const total = grouped.reduce((sum, row) => sum + row._count, 0);
  const stats = [
    { href: "/desk/template/leads", label: "Leads in play", value: counts.template.gathered, icon: IconUsers, hint: `${total} in this workflow` },
    { href: "/desk/template/leads", label: "Drafts to review", value: counts.template.drafted, icon: IconPencil, hint: "Waiting for approval" },
    { href: "/desk/sent", label: "Sent", value: (byStatus.get("sent") ?? 0) + (byStatus.get("replied") ?? 0), icon: IconSend, hint: "From this workflow" },
    { href: "/desk/inbox", label: "Replied", value: byStatus.get("replied") ?? 0, icon: IconInbox, hint: "From this workflow" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Without PPT · template only"
        title="Overview"
        description="No concept or PDF. Each lead gets a custom proposal written into a designed email, with a button to your template site."
        action={
          counts.template.drafted ? (
            <ButtonLink href="/desk/template/leads" variant="primary" icon={<IconPencil size={15} />}>
              Review {counts.template.drafted} {counts.template.drafted === 1 ? "draft" : "drafts"}
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

      <TemplateSiteCard initialUrl={siteUrl} />

      <div className="grid gap-4 lg:grid-cols-2">
        <UploadCard mode="template" />
        <PrepareCard
          initialRun={run}
          aiReady={aiReady()}
          waiting={waiting}
          mode="template"
          blocked={siteUrl ? undefined : "Add the template site link above before running Prepare."}
        />
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-slate-900">Recently updated</h2>
          <Link href="/desk/template/leads" className="text-[13px] font-medium text-mint-700 hover:underline">
            View all leads
          </Link>
        </div>
        <ProspectTable rows={recent.map(toListItem)} empty="Import an Apollo export into this workflow to start." />
      </section>
    </div>
  );
}
