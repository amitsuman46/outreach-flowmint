import { NextResponse } from "next/server";
import { deploySite } from "@/lib/netlify";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  try {
    const result = await deploySite();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publishing failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
