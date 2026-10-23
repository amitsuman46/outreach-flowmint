import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Browser } from "playwright";
import { findingsSchema, type Finding } from "./schemas";
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

export interface PageCapture {
  pageUrl: string;
  pageText: string;
  screenshot: Buffer;
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
    await page.goto(website, { waitUntil: "domcontentloaded", timeout: 25_000 });
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
    return {
      pageUrl: page.url(),
      pageText,
      screenshot,
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
