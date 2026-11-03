import { prisma } from "./prisma";

/**
 * Brings rejected leads back into the pipeline. A person chose to override the rejection,
 * so they skip the AI fit check and go straight to the site review on the next Prepare run.
 * Anyone already emailed goes back to Sent, so restoring never sends them a second first email.
 */
export async function restoreProspects(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await prisma.prospect.findMany({
    where: { id: { in: ids }, status: "rejected" },
    select: { id: true, messages: { where: { status: "sent" }, select: { id: true }, take: 1 } },
  });
  const contacted = rows.filter((row) => row.messages.length).map((row) => row.id);
  const fresh = rows.filter((row) => !row.messages.length).map((row) => row.id);
  await prisma.$transaction([
    prisma.prospect.updateMany({
      where: { id: { in: fresh } },
      data: { status: "fit", rejectReason: null, lastError: null },
    }),
    prisma.prospect.updateMany({
      where: { id: { in: contacted } },
      data: { status: "sent", rejectReason: null, lastError: null },
    }),
  ]);
  return rows.length;
}
