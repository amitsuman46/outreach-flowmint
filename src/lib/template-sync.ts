import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { practiceContentSchema, type PracticeContent } from "./schemas";
import { demoBaseUrl, siteDir } from "./site-config";

/**
 * The concept site is a hand-built template (index.html, css, js/practices.js, js/main.js)
 * personalised with ?for=<key>. The desk never edits practices.js. It adds js/leads.js,
 * which merges generated practices into PRACTICES, and one script tag in index.html to load it.
 */

export const LEADS_SCRIPT = "js/leads.js";
const LEADS_TAG = `<script src="${LEADS_SCRIPT}"></script>`;

/** Paths the desk writes. Everything else on the live site belongs to the template. */
export function isDeskOwned(sitePath: string): boolean {
  const rel = sitePath.replace(/^\//, "");
  return (
    rel === LEADS_SCRIPT ||
    rel.startsWith("proposals/") ||
    rel === "assets/flowmint-logo.png" ||
    // Concept pages from before the template, e.g. body-curious-j53b6d/index.html.
    /^[a-z0-9-]+-[a-z0-9]{6}\//.test(rel)
  );
}

export type LiveFile = { path: string; sha: string };

/** Netlify injects a comment and a script into served HTML. Strip them to get the stored file back. */
function stripNetlifyInjections(html: string): string {
  return html
    .replace(/\n?<!-- This site is hosted on Netlify\.[\s\S]*?-->/, "")
    .replace(/<script[^>]*\/\.netlify\/scripts\/[^>]*><\/script>\n?/g, "");
}

function sha1(content: Buffer | string): string {
  return createHash("sha1").update(content).digest("hex");
}

/**
 * Copies the live template into storage/site so pages can be rendered locally and published
 * without losing anything. Each file is checked against Netlify's SHA1, so a copy that is not
 * byte-for-byte the original is never uploaded back.
 */
export async function pullTemplate(liveFiles: LiveFile[]): Promise<void> {
  const root = siteDir();
  for (const file of liveFiles) {
    if (isDeskOwned(file.path)) continue;
    const local = path.join(root, file.path);
    if (existsSync(local) && sha1(await readFile(local)) === file.sha) continue;
    const response = await fetch(`${demoBaseUrl()}${file.path}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not download ${file.path} from the concept site (${response.status}).`);
    let content: Buffer = Buffer.from(await response.arrayBuffer());
    if (file.path.endsWith(".html")) content = Buffer.from(stripNetlifyInjections(content.toString("utf8")));
    if (sha1(content) !== file.sha) {
      throw new Error(
        `The downloaded ${file.path} does not match the live file, so publishing stopped to protect the template. Try again in a minute.`,
      );
    }
    await mkdir(path.dirname(local), { recursive: true });
    await writeFile(local, content);
  }
  // Concept pages from before the template are no longer used.
  await removeLegacyFolders();
}

async function removeLegacyFolders(): Promise<void> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(siteDir(), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory() && /^[a-z0-9-]+-[a-z0-9]{6}$/.test(entry.name)) {
      await rm(path.join(siteDir(), entry.name), { recursive: true, force: true });
    }
  }
}

/** Adds the leads.js script tag after practices.js. Leaves the file alone when it is already there. */
export async function ensureLeadsTag(): Promise<void> {
  const file = path.join(siteDir(), "index.html");
  const html = await readFile(file, "utf8");
  if (html.includes(LEADS_TAG)) return;
  const anchor = /(<script src="js\/practices\.js"><\/script>)/;
  if (!anchor.test(html)) {
    throw new Error("index.html no longer loads js/practices.js, so the desk cannot add its practices.");
  }
  await writeFile(file, html.replace(anchor, `$1\n  ${LEADS_TAG}`));
}

/** Keys already used by hand-written entries in practices.js, which the desk must not overwrite. */
export async function templateKeys(): Promise<{ practices: string[]; help: string[] }> {
  const source = await readFile(path.join(siteDir(), "js", "practices.js"), "utf8").catch(() => "");
  const block = (name: string) => {
    const start = source.indexOf(`const ${name} = {`);
    if (start < 0) return "";
    const end = source.indexOf("\n};", start);
    return source.slice(start, end < 0 ? undefined : end);
  };
  const keysIn = (text: string, indent: number) =>
    [...text.matchAll(new RegExp(`^ {${indent}}([A-Za-z0-9_]+):\\s*\\{`, "gm"))].map((match) => match[1]);
  return { practices: keysIn(block("PRACTICES"), 2), help: keysIn(block("HELP"), 2) };
}

/** Rewrites js/leads.js from every proposal in the database. */
export async function writeLeadsScript(): Promise<void> {
  const proposals = await prisma.proposal.findMany({ orderBy: { createdAt: "asc" } });
  const reserved = new Set((await templateKeys()).practices);
  const entries: Record<string, PracticeContent> = {};
  for (const proposal of proposals) {
    if (reserved.has(proposal.slug)) continue;
    try {
      const parsed = practiceContentSchema.safeParse(JSON.parse(proposal.site));
      if (parsed.success) {
        // Leave out empty optional fields so the template's own defaults and checks apply.
        entries[proposal.slug] = Object.fromEntries(
          Object.entries(parsed.data).filter(([, value]) => value !== ""),
        ) as PracticeContent;
      }
    } catch {
      // Built before the template; a refresh rebuilds it.
    }
  }
  const body = `// Generated by the FlowMint outreach desk. Changes here are overwritten on the next publish.
// Hand-written practices belong in practices.js, which the desk never edits.
Object.assign(PRACTICES, ${JSON.stringify(entries, null, 2)});
`;
  await mkdir(path.join(siteDir(), "js"), { recursive: true });
  await writeFile(path.join(siteDir(), LEADS_SCRIPT), body);
}
