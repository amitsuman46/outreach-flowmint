import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { netlifyConfig, siteDir } from "./site-config";
import { ensureLeadsTag, isDeskOwned, type LiveFile, pullTemplate, writeLeadsScript } from "./template-sync";

const API = "https://api.netlify.com/api/v1";

export class NetlifyNotConfiguredError extends Error {
  constructor() {
    super("Add NETLIFY_AUTH_TOKEN to .env to publish the concept site.");
    this.name = "NetlifyNotConfiguredError";
  }
}

async function call<T>(method: string, url: string, body?: unknown, raw?: Buffer): Promise<T> {
  const { token } = netlifyConfig();
  if (!token) throw new NetlifyNotConfiguredError();
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": raw ? "application/octet-stream" : "application/json",
    },
    body: raw ? new Uint8Array(raw) : body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`Netlify ${response.status}: ${text.slice(0, 200) || response.statusText}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return (await response.json().catch(() => ({}))) as T;
}

let cachedSiteId: string | null = null;

/** Finds the site named in NETLIFY_SITE, creating it on the free plan the first time. */
async function siteId(): Promise<string> {
  if (cachedSiteId) return cachedSiteId;
  const { site } = netlifyConfig();
  try {
    const found = await call<{ id: string }>("GET", `/sites/${site}.netlify.app`);
    cachedSiteId = found.id;
    return found.id;
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
  }
  try {
    const created = await call<{ id: string }>("POST", "/sites", { name: site });
    cachedSiteId = created.id;
    return created.id;
  } catch (error) {
    if ((error as { status?: number }).status === 422) {
      throw new Error(`The Netlify name "${site}" is taken. Set NETLIFY_SITE to another name.`);
    }
    throw error;
  }
}

/** Path → SHA1 of every file in the current production deploy. Netlify reuses these without an upload. */
async function liveFileList(id: string): Promise<LiveFile[]> {
  const files = await call<Array<{ path: string; sha: string }>>("GET", `/sites/${id}/files`);
  return files.filter((file) => file.path && file.sha).map((file) => ({ path: file.path, sha: file.sha }));
}

/** Brings storage/site up to date with the template that is live on Netlify. */
export async function syncTemplate(): Promise<void> {
  await pullTemplate(await liveFileList(await siteId()));
  await ensureLeadsTag();
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(path.join(dir, entry.name), rel)));
    else files.push(rel);
  }
  return files;
}

// Shared across module copies so two routes cannot publish at the same time.
const deployState = globalThis as typeof globalThis & {
  __outreachDeploy?: Promise<{ url: string }> | null;
};

/**
 * Publishes storage/site on top of the live site as a new production deploy.
 * Live files are kept unless a local file has the same path. Netlify only asks for
 * files whose SHA1 it has not seen, so each deploy sends just what changed.
 */
export function deploySite(): Promise<{ url: string }> {
  if (deployState.__outreachDeploy) return deployState.__outreachDeploy;
  const running = runDeploy().finally(() => {
    deployState.__outreachDeploy = null;
  });
  deployState.__outreachDeploy = running;
  return running;
}

async function runDeploy(): Promise<{ url: string }> {
  const startedAt = new Date();
  const root = siteDir();
  try {
    const id = await siteId();
    // Pull the template first, so a change deployed by hand since the last build is kept.
    const live = await liveFileList(id);
    await pullTemplate(live);
    await ensureLeadsTag();
    await writeLeadsScript();
    const files = await listFiles(root);
    if (!files.length) throw new Error("The concept site has no files yet.");
    const contents = new Map<string, Buffer>();
    // Keep any live file the desk did not create and has no local copy of. Desk-owned
    // leftovers, such as the old per-lead concept folders, are left out and so removed.
    const digest: Record<string, string> = {};
    for (const file of live) {
      if (!isDeskOwned(file.path)) digest[file.path] = file.sha;
    }
    for (const rel of files) {
      const content = await readFile(path.join(root, rel));
      const sha = createHash("sha1").update(content).digest("hex");
      contents.set(sha, content);
      digest[`/${rel}`] = sha;
    }
    const deploy = await call<{ id: string; required?: string[]; ssl_url?: string; url?: string }>(
      "POST",
      `/sites/${id}/deploys`,
      { files: digest },
    );
    const required = new Set(deploy.required ?? []);
    for (const [rel, sha] of Object.entries(digest)) {
      if (!required.has(sha)) continue;
      required.delete(sha);
      const encoded = rel.split("/").map(encodeURIComponent).join("/");
      await call("PUT", `/deploys/${deploy.id}/files${encoded}`, undefined, contents.get(sha));
    }
    const ready = await waitForDeploy(deploy.id);
    await prisma.proposal.updateMany({
      where: { builtAt: { lte: startedAt } },
      data: { deployedAt: startedAt, deployError: null },
    });
    return { url: ready };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deploy failed";
    await prisma.proposal.updateMany({
      where: { OR: [{ deployedAt: null }, { builtAt: { gt: prisma.proposal.fields.deployedAt } }] },
      data: { deployError: message.slice(0, 300) },
    });
    throw error;
  }
}

async function waitForDeploy(id: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const deploy = await call<{ state: string; error_message?: string; ssl_url?: string }>(
      "GET",
      `/deploys/${id}`,
    );
    if (deploy.state === "ready") return deploy.ssl_url ?? "";
    if (deploy.state === "error") throw new Error(deploy.error_message || "Netlify deploy failed");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Netlify took too long to publish. Try again in a minute.");
}

export function isDeploying(): boolean {
  return Boolean(deployState.__outreachDeploy);
}
