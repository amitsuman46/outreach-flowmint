import { NextResponse } from "next/server";
import { readScreenshot } from "@/lib/present";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: Context) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  if (id.includes("/") || id.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const image = await readScreenshot(id);
  if (!image) {
    return NextResponse.json({ error: "No screenshot yet" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
