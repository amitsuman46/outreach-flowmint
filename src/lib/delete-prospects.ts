import { rm } from "node:fs/promises";
import { screenshotFile } from "./audit";
import { prisma } from "./prisma";
import { proposalPdfFile } from "./site-config";

/**
 * Deletes leads with their review, concept, PDF and drafts. Their emails stay in Mail and
 * Sent items (unlinked), so re-importing them is still recognised as already contacted.
 * A deleted lead's concept leaves the live site on the next publish.
 */
export async function deleteProspects(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const proposals = await prisma.proposal.findMany({ where: { prospectId: { in: ids } }, select: { slug: true } });
  const { count } = await prisma.$transaction(async (tx) => {
    await tx.inboxMessage.updateMany({ where: { prospectId: { in: ids } }, data: { prospectId: null } });
    return tx.prospect.deleteMany({ where: { id: { in: ids } } });
  });
  await Promise.all([
    ...ids.map((id) => rm(screenshotFile(id), { force: true })),
    ...proposals.map((proposal) => rm(proposalPdfFile(proposal.slug), { force: true })),
  ]);
  return count;
}
