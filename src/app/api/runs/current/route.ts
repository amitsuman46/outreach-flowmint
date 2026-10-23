import { NextResponse } from "next/server";
import { currentRun } from "@/lib/pipeline";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  return NextResponse.json({ run: await currentRun() });
}
