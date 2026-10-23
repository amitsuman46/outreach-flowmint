import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateDraftSchema } from "@/lib/schemas";
import { readSession } from "@/lib/session";
import { ensureOptOut } from "@/lib/opt-out";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: Context) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const parsed = updateDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
  }

  const prospect = await prisma.prospect.findUnique({ where: { id } });
  if (!prospect) {
    return NextResponse.json({ error: "That person is no longer on the desk" }, { status: 404 });
  }
  if (prospect.status !== "drafted") {
    return NextResponse.json({ error: "This draft is not editable" }, { status: 409 });
  }
  const message = await prisma.outreachMessage.findFirst({
    where: { prospectId: id, status: "draft" },
    orderBy: { createdAt: "desc" },
  });
  if (!message) {
    return NextResponse.json({ error: "No draft to save" }, { status: 404 });
  }
  await prisma.outreachMessage.update({
    where: { id: message.id },
    data: {
      subject: parsed.data.subject,
      body: ensureOptOut(parsed.data.body),
      error: null,
    },
  });
  return NextResponse.json({ saved: true });
}
