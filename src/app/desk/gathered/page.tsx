import { ProspectTable } from "@/components/prospect-table";
import { RefreshButton } from "@/components/refresh-button";
import { PageHeader } from "@/components/ui";
import { toListItem } from "@/lib/present";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function GatheredPage() {
  const rows = await prisma.prospect.findMany({
    where: { status: { in: ["imported", "fit", "audited", "drafted", "sent", "replied"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      proposal: { select: { builtAt: true } },
      messages: { where: { status: "draft" }, select: { updatedAt: true }, take: 1 },
    },
  });
  const drafted = rows.filter((row) => row.status === "drafted").length;
  return (
    <div>
      <PageHeader
        title="Leads"
        description="Everyone still in play, from imported to replied. Open a lead to review the concept, the PDF and the draft."
        action={<RefreshButton count={drafted} label={`Refresh all drafts (${drafted})`} />}
      />
      <ProspectTable
        rows={rows.map(toListItem)}
        extra={Object.fromEntries(
          rows.map((row) => [
            row.id,
            {
              hasProposal: Boolean(row.proposal),
              // The concept was rebuilt after the email was written, so the email may not match it.
              outdated: Boolean(
                row.status === "drafted" && row.proposal && row.messages[0] && row.messages[0].updatedAt < row.proposal.builtAt,
              ),
            },
          ]),
        )}
        empty="Nobody gathered yet. Import an Apollo export from the overview."
        filters
      />
    </div>
  );
}
