/**
 * Builds the concept page and PDF for one lead from the command line.
 * Usage: node --env-file=.env --import tsx scripts/build-proposal.ts <prospectId>
 */
import { launchScreenshotBrowser } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";
import { buildProposal } from "../src/lib/proposal";
import { demoUrl } from "../src/lib/site-config";

const id = process.argv[2];
if (!id) {
  console.error("Pass a prospect id.");
  process.exit(1);
}
async function main() {
  const started = Date.now();
  const browser = await launchScreenshotBrowser();
  try {
    await buildProposal(id, browser);
    const proposal = await prisma.proposal.findUnique({ where: { prospectId: id } });
    console.log(`Built in ${Math.round((Date.now() - started) / 1000)}s → ${demoUrl(proposal!.slug)} (publish to make it live)`);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

void main();
