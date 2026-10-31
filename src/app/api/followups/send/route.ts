import { NextResponse } from "next/server";
import { startFollowUps } from "@/lib/followups";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

/** Starts sending one follow-up step to everyone outstanding for it. The send runs in the background. */
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const input = (await request.json().catch(() => ({}))) as { step?: unknown };
  const step = Number(input.step);
  if (!Number.isInteger(step) || step < 1) {
    return NextResponse.json({ error: "Pick which follow-up to send" }, { status: 400 });
  }
  const result = await startFollowUps(step);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
