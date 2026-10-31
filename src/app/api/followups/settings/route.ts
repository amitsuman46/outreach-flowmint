import { NextResponse } from "next/server";
import { saveFollowUpSettings } from "@/lib/followups";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

/** Saves the days and text for each follow-up. */
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  try {
    const settings = await saveFollowUpSettings(await request.json().catch(() => null));
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Not saved" }, { status: 400 });
  }
}
