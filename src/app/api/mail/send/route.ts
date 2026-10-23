import { NextResponse } from "next/server";
import { readUploads } from "@/lib/attachments";
import { sendCustomMail } from "@/lib/mail";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Add a recipient, subject, and message." }, { status: 400 });
  }

  try {
    const files = await readUploads(form.getAll("files"));
    const result = await sendCustomMail({
      to: String(form.get("to") ?? ""),
      subject: String(form.get("subject") ?? ""),
      body: String(form.get("body") ?? ""),
      files,
      withSignature: form.get("withSignature") !== "0",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    const status = message.includes("not configured") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
