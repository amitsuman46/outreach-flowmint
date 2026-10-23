import { NextResponse } from "next/server";
import { startRefresh } from "@/lib/pipeline";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

/** Starts a background refresh of unsent drafts: rebuild concept and PDF, then rewrite the email. */
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const input = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(input.ids) ? input.ids.filter((id): id is string => typeof id === "string") : undefined;
  const result = await startRefresh(ids);
  if (!result.started) {
    return NextResponse.json({ error: "Another run is still going. Wait for it to finish.", run: result.run }, { status: 409 });
  }
  return NextResponse.json(result);
}
