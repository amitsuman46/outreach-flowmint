import { NextResponse } from "next/server";
import { writeDraft } from "@/lib/draft";
import { plainPrepareError } from "@/lib/pipeline";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Context {
  params: Promise<{ id: string }>;
}

/** Rewrites the draft from the site review, measured facts and concept. Only before sending. */
export async function POST(_request: Request, context: Context) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const prospect = await prisma.prospect.findUnique({ where: { id }, include: { audit: true } });
  if (!prospect) {
    return NextResponse.json({ error: "That person is no longer on the desk" }, { status: 404 });
  }
  if (prospect.status === "sent" || prospect.status === "replied") {
    return NextResponse.json({ error: "This email was already sent" }, { status: 409 });
  }
  if (!prospect.audit) {
    return NextResponse.json({ error: "Run Prepare first so the site is reviewed." }, { status: 400 });
  }
  try {
    const problems = await writeDraft(id);
    const draft = await prisma.outreachMessage.findFirst({
      where: { prospectId: id, status: "draft" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ subject: draft?.subject ?? "", body: draft?.body ?? "", problems });
  } catch (error) {
    return NextResponse.json({ error: plainPrepareError(error) }, { status: 400 });
  }
}
