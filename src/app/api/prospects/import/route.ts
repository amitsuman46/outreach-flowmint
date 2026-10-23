import { NextResponse } from "next/server";
import { parseApolloSheet } from "@/lib/apollo";
import { importProspects } from "@/lib/import-prospects";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
    return NextResponse.json({ error: "Upload an Excel or CSV file" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File is larger than 10MB" }, { status: 400 });
  }

  const rows = parseApolloSheet(Buffer.from(await file.arrayBuffer()));
  if (!rows.length) {
    return NextResponse.json({ error: "No rows found" }, { status: 400 });
  }
  const result = await importProspects(rows);
  return NextResponse.json(result);
}
