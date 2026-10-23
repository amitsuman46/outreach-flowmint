import { NextResponse } from "next/server";
import { readUploads } from "@/lib/attachments";
import { sendApprovedDraft } from "@/lib/mail";
import { updateDraftSchema } from "@/lib/schemas";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: Context) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const contentType = request.headers.get("content-type") ?? "";
  let subject = "";
  let body = "";
  let files: Awaited<ReturnType<typeof readUploads>> = [];
  let includeDemo = false;
  let attachProposal = false;
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      subject = String(form.get("subject") ?? "");
      body = String(form.get("body") ?? "");
      includeDemo = form.get("includeDemo") === "1";
      attachProposal = form.get("attachProposal") === "1";
      files = await readUploads(form.getAll("files"));
    } else {
      const parsed = updateDraftSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
      }
      subject = parsed.data.subject;
      body = parsed.data.body;
    }
    const draft = updateDraftSchema.safeParse({ subject, body });
    if (!draft.success) {
      return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
    }
    const result = await sendApprovedDraft(id, draft.data.subject, draft.data.body, files, {
      includeDemo,
      attachProposal,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    const status = message.includes("already sent") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
