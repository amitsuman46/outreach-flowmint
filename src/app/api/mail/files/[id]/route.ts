import { NextResponse } from "next/server";
import { parseAttachments, readStoredFile, safeName } from "@/lib/attachments";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const messages = await prisma.inboxMessage.findMany({
    where: { attachments: { contains: id } },
    select: { attachments: true },
    take: 5,
  });
  const file = messages.flatMap((message) => parseAttachments(message.attachments)).find((item) => item.id === id);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  try {
    const bytes = await readStoredFile(id);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName(file.name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
