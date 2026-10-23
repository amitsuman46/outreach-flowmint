import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { launchScreenshotBrowser } from "@/lib/audit";
import { deploySite } from "@/lib/netlify";
import { plainPrepareError } from "@/lib/pipeline";
import { prisma } from "@/lib/prisma";
import { buildProposal, toProposalView } from "@/lib/proposal";
import { readSession } from "@/lib/session";
import { netlifyReady, proposalPdfFile, safeFileName } from "@/lib/site-config";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Context {
  params: Promise<{ id: string }>;
}

/** Builds (or rebuilds) the concept page and PDF, then publishes when Netlify is set up. */
export async function POST(_request: Request, context: Context) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const browser = await launchScreenshotBrowser().catch(() => null);
  if (!browser) {
    return NextResponse.json({ error: "The screenshot browser did not open. Try again." }, { status: 500 });
  }
  try {
    await buildProposal(id, browser);
  } catch (error) {
    return NextResponse.json({ error: plainPrepareError(error) }, { status: 400 });
  } finally {
    await browser.close();
  }

  let warning: string | undefined;
  if (netlifyReady()) {
    try {
      await deploySite();
    } catch (error) {
      warning = `Built, but publishing failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  } else {
    warning = "Built locally. Add NETLIFY_AUTH_TOKEN to publish the concept page.";
  }
  const proposal = await prisma.proposal.findUnique({ where: { prospectId: id } });
  return NextResponse.json({ proposal: proposal ? toProposalView(proposal) : null, warning });
}

/** Opens the proposal PDF in the desk. */
export async function GET(_request: Request, context: Context) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const proposal = await prisma.proposal.findUnique({
    where: { prospectId: id },
    include: { prospect: { select: { company: true } } },
  });
  if (!proposal?.hasPdf) {
    return NextResponse.json({ error: "No proposal yet" }, { status: 404 });
  }
  try {
    const pdf = await readFile(proposalPdfFile(proposal.slug));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFileName(`${proposal.prospect.company} - FlowMint proposal.pdf`)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "The PDF file is missing. Rebuild the proposal." }, { status: 404 });
  }
}
