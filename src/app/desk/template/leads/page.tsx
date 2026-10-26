import { ProspectTable } from "@/components/prospect-table";
import { RefreshButton } from "@/components/refresh-button";
import { PageHeader } from "@/components/ui";
import { toListItem } from "@/lib/present";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TemplateLeadsPage() {
  const rows = await prisma.prospect.findMany({
    where: { mode: "template", status: { in: ["imported", "fit", "audited", "drafted", "sent", "replied"] } },
    orderBy: { updatedAt: "desc" },
  });
  const drafted = rows.filter((row) => row.status === "drafted").length;
  return (
    <div>
      <PageHeader
        eyebrow="Without PPT · template only"
        title="Leads"
        description="Open a lead to review its proposal email, exactly as it will arrive, before sending."
        action={<RefreshButton mode="template" count={drafted} label={`Rewrite all drafts (${drafted})`} />}
      />
      <ProspectTable
        rows={rows.map(toListItem)}
        empty="Nobody here yet. Import an Apollo export on the Without PPT overview."
        filters
      />
    </div>
  );
}
