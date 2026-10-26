import { NextResponse } from "next/server";
import { startPrepare } from "@/lib/pipeline";
import { asMode } from "@/lib/schemas";
import { readSession } from "@/lib/session";
import { templateSiteUrl } from "@/lib/settings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const input = (await request.json().catch(() => ({}))) as { mode?: unknown };
  const mode = asMode(input.mode);
  if (mode === "template" && !(await templateSiteUrl())) {
    return NextResponse.json({ error: "Add the template site link first." }, { status: 400 });
  }
  const result = await startPrepare(mode);
  return NextResponse.json(result);
}
