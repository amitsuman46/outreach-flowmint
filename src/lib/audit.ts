import { Resolver } from "node:dns/promises";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { findingsSchema, type Finding } from "./schemas";
import { desktopFacts, detectPlatform, type SiteFacts } from "./site-facts";
import { auditSchema, generateObject } from "./ai";

export const AUDIT_SYSTEM_PROMPT = `
You review a business homepage for FlowMint, a consultancy that redesigns interfaces, improves online presence, and builds practical software.

Look at the screenshot and the page text. Return findings only for what you can actually see or read. Cover SEO, color, and UX when the page supports it. Use area values seo, color, and ux. Each observation names something specific on this page. Each suggestion is one practical change. Do not invent awards, traffic numbers, or pages you were not shown. Omit an area rather than guessing.
`.trim();

export function auditDir(): string {
  return path.join(process.cwd(), "storage", "audits");
}

export function screenshotFile(prospectId: string): string {
  return path.join(auditDir(), `${prospectId}.png`);
}

/** A current desktop Chrome user agent. The headless default gets blocked by some site firewalls. */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const BLOCK_PATTERN =
  /attention required!? \| cloudflare|sorry, you have been blocked|just a moment\.\.\.|verify you are human|checking your browser|access denied|captcha|request unsuccessful\. incapsula|ddos protection by/i;

/** True when the captured text is a firewall or captcha page rather than the business homepage. */
export function looksBlocked(pageText: string | null | undefined): boolean {
  return Boolean(pageText && BLOCK_PATTERN.test(pageText.slice(0, 600)));
}

export class SiteBlockedError extends Error {
  constructor() {
    super("Their site blocked our automated browser (firewall or captcha), so it could not be reviewed. Check the site by hand.");
    this.name = "SiteBlockedError";
  }
}

/** The site did not load at all: timed out, no DNS, refused, or a broken certificate. */
export class SiteUnreachableError extends Error {
  constructor(detail: string) {
    super(`Their website did not load (${detail}).`);
    this.name = "SiteUnreachableError";
  }
}

/** Other spellings of the same address, tried when the given one does not load. */
function addressVariants(website: string): string[] {
  const variants = [website];
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    const host = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    variants.push(`https://${host}${url.pathname}`);
    variants.push(`http://${url.hostname}${url.pathname}`);
  } catch {
    // Keep only the original.
  }
  return [...new Set(variants)];
}

function plainLoadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/Timeout/i.test(raw)) return "it timed out";
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/i.test(raw)) return "the address could not be found";
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE/i.test(raw)) {
    return "the server did not respond";
  }
  if (/ERR_CERT|SSL/i.test(raw)) return "its security certificate failed";
  return raw.split("\n")[0].slice(0, 120);
}

/**
 * Slow sites get a second, longer chance, then the www and http spellings are tried.
 * Only when every attempt fails is the site treated as unreachable.
 */
/**
 * True only when public DNS says the domain does not exist, with or without www.
 * Some routers take 30 seconds to say so, which looks like a timeout in the browser.
 */
async function domainMissing(website: string): Promise<boolean> {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  const resolver = new Resolver({ timeout: 4000, tries: 1 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  const missing = async (name: string) => {
    try {
      await resolver.resolve(name, "A");
      return false;
    } catch (error) {
      const code = (error as { code?: string }).code;
      // NXDOMAIN-style answers only. Timeouts or a blocked resolver prove nothing.
      return code === "ENOTFOUND" || code === "ENODATA";
    }
  };
  const [bare, www] = await Promise.all([missing(host), missing(`www.${host}`)]);
  return bare && www;
}

async function openWithRetries(page: Page, website: string): Promise<void> {
  if (await domainMissing(website)) throw new SiteUnreachableError("the address could not be found");
  const [original, ...others] = addressVariants(website);
  // The given address gets a normal try and a long one; other spellings get one shorter try.
  // Worst case is about two minutes, after which the site counts as unreachable.
  const attempts: [string, "domcontentloaded" | "commit", number][] = [
    [original, "domcontentloaded", 30_000],
    [original, "commit", 45_000],
    ...others.map((address): [string, "commit", number] => [address, "commit", 20_000]),
  ];
  let firstError: unknown;
  let unresolved = false;
  for (const [address, waitUntil, timeout] of attempts) {
    // A failed DNS lookup won't fix itself on a longer wait; only other spellings are worth trying.
    if (unresolved && address === original) continue;
    try {
      const response = await page.goto(address, { waitUntil, timeout });
      if (waitUntil === "commit") {
        // The server answered; give the page time to render something.
        await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
      }
      if (response && response.status() >= 500) throw new Error(`HTTP ${response.status()}`);
      return;
    } catch (error) {
      firstError ??= error;
      if (address === original && /ERR_NAME_NOT_RESOLVED|ENOTFOUND/i.test(String(error))) unresolved = true;
    }
  }
  // Describe what happened to the address the lead gave us, not to a guessed spelling.
  throw new SiteUnreachableError(plainLoadError(firstError));
}

export interface PageCapture {
  pageUrl: string;
  pageText: string;
  screenshot: Buffer;
  /** Desktop facts read from the same page load. Phone facts are added by the caller. */
  facts: SiteFacts | null;
}

export async function launchScreenshotBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  const saved = process.env.PLAYWRIGHT_BROWSERS_PATH;
  delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  try {
    const executablePath = installedBrowser(chromium.executablePath());
    return await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  } finally {
    if (saved === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = saved;
  }
}

function installedBrowser(preferred: string): string | undefined {
  if (preferred && existsSync(preferred)) return preferred;
  const root = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter((name) => name.startsWith("chromium_headless_shell-"));
  const fileName = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  for (const dir of dirs) {
    for (const arch of ["mac-arm64", "mac-x64", "linux-arm64", "linux", "win64"]) {
      const file = path.join(root, dir, `chrome-headless-shell-${arch}`, fileName);
      if (existsSync(file)) return file;
    }
  }
  return undefined;
}

export async function captureHomepage(
  browser: Browser,
  website: string,
): Promise<PageCapture> {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    userAgent: BROWSER_USER_AGENT,
  });
  try {
    await openWithRetries(page, website);
    await page.waitForTimeout(1200);
    const extracted = await page.evaluate(() => {
      const description =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ?? "";
      const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
      return {
        title: document.title ?? "",
        description,
        text: text.slice(0, 3500),
      };
    });
    const screenshot = await page.screenshot({ type: "png" });
    const pageText = [
      extracted.title && `Title: ${extracted.title}`,
      extracted.description && `Meta description: ${extracted.description}`,
      extracted.text,
    ]
      .filter(Boolean)
      .join("\n");
    if (looksBlocked(pageText)) throw new SiteBlockedError();
    let facts: SiteFacts | null = null;
    try {
      const desktop = await desktopFacts(page);
      facts = {
        headline: desktop.headline,
        menuLinks: desktop.menuLinks,
        bookingLabels: desktop.bookingLabels,
        desktopBookingAboveFold: desktop.desktopBookingAboveFold,
        bookingPlatform: detectPlatform(desktop.urls),
        mobile: null,
      };
    } catch {
      facts = null;
    }
    return {
      pageUrl: page.url(),
      pageText,
      screenshot,
      facts,
    };
  } finally {
    await page.close();
  }
}

export async function reviewPage(
  capture: PageCapture,
): Promise<Finding[]> {
  const prompt = `Page URL: ${capture.pageUrl}\n\nPage text:\n${capture.pageText.slice(0, 3000)}`;
  let parsed: { findings?: Finding[] };
  try {
    parsed = await generateObject({
      system: AUDIT_SYSTEM_PROMPT,
      prompt,
      schema: auditSchema,
      imagePng: capture.screenshot,
    });
  } catch (error) {
    if (!capture.pageText.trim()) throw error;
    parsed = await generateObject({
      system: AUDIT_SYSTEM_PROMPT,
      prompt,
      schema: auditSchema,
    });
  }
  const findings = findingsSchema.safeParse(parsed.findings ?? []);
  return findings.success ? findings.data.slice(0, 6) : [];
}

export async function saveScreenshot(
  prospectId: string,
  screenshot: Buffer,
): Promise<string> {
  const dir = auditDir();
  await mkdir(dir, { recursive: true });
  const file = screenshotFile(prospectId);
  await writeFile(file, screenshot);
  return file;
}
