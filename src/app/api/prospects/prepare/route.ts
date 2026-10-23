import { NextResponse } from "next/server";
import { startPrepare } from "@/lib/pipeline";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const result = await startPrepare();
  return NextResponse.json(result);
}
