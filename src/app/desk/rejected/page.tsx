import { ProspectTable } from "@/components/prospect-table";
import { PageHeader } from "@/components/ui";
import { toListItem } from "@/lib/present";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RejectedPage() {
  const rows = await prisma.prospect.findMany({
    where: { status: "rejected" },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div>
      <PageHeader
        title="Rejected"
        description="Missing or unverified email, no website, a bounced address, Qualify Contact marked no, or a fit check that said no. Each row shows why."
      />
      <ProspectTable rows={rows.map(toListItem)} empty="Nobody rejected yet." filters />
    </div>
  );
}
