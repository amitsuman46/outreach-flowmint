import { NextResponse } from "next/server";
import { restoreProspects } from "@/lib/restore-prospects";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const input = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(input.ids) ? input.ids.filter((id): id is string => typeof id === "string").slice(0, 1000) : [];
  if (!ids.length) {
    return NextResponse.json({ error: "Choose at least one rejected lead." }, { status: 400 });
  }
  const restored = await restoreProspects(ids);
  return NextResponse.json({ restored });
}
