import { NextResponse } from "next/server";
import { followUpJob, stopFollowUps } from "@/lib/followups";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

/** Progress of the follow-up send, if one ran since the server started. */
export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  return NextResponse.json({ job: followUpJob() });
}

/** Stops the send after the email that is going out now. */
export async function DELETE() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  stopFollowUps();
  return NextResponse.json({ job: followUpJob() });
}
