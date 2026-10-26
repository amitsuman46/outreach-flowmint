import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { setTemplateSiteUrl } from "@/lib/settings";

export const runtime = "nodejs";

/** Saves the template website link used in every "Without PPT" email. */
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const input = (await request.json().catch(() => ({}))) as { url?: unknown };
  try {
    const url = await setTemplateSiteUrl(String(input.url ?? ""));
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the link" }, { status: 400 });
  }
}
