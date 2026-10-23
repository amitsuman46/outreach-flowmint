import { NextResponse } from "next/server";
import { syncInbox } from "@/lib/mail";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  try {
    const result = await syncInbox();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the mailbox";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
