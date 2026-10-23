import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { siteDir } from "@/lib/site-config";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * Serves the local copy of the concept site, so a practice can be checked before it is published.
 * Open /api/demo/index.html?for=<key>; the template's relative css and js load from here too.
 */
export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const parts = (await context.params).path;
  if (parts.some((part) => part === ".." || part.includes("/") || part.startsWith("."))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const root = siteDir();
  let file = path.join(root, ...parts);
  if (!path.extname(file)) file = path.join(file, "index.html");
  if (!file.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const body = await readFile(file);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
