import path from "node:path";
import type { Signature } from "./email-template";

/** Folder that mirrors the whole Netlify demo site. Every deploy uploads this tree. */
export function siteDir(): string {
  return path.join(process.cwd(), "storage", "site");
}

/** PDFs live under /proposals so they never collide with template files. */
export function proposalPdfFile(key: string): string {
  return path.join(siteDir(), "proposals", `${key}.pdf`);
}

export function netlifyConfig(): { token: string; site: string } {
  return {
    token: process.env.NETLIFY_AUTH_TOKEN?.trim() ?? "",
    site: (process.env.NETLIFY_SITE?.trim() || "flowmint-demos").toLowerCase(),
  };
}

export function netlifyReady(): boolean {
  return Boolean(netlifyConfig().token);
}

/** Public base URL of the demo site, without a trailing slash. */
export function demoBaseUrl(): string {
  const custom = process.env.NETLIFY_SITE_URL?.trim();
  if (custom) return custom.replace(/\/$/, "");
  return `https://${netlifyConfig().site}.netlify.app`;
}

/** The template personalised for one practice, e.g. https://med-site-proposal.netlify.app/?for=bodycurious */
export function demoUrl(key: string): string {
  return `${demoBaseUrl()}/?for=${encodeURIComponent(key)}`;
}

export function demoPdfUrl(key: string): string {
  return `${demoBaseUrl()}/proposals/${encodeURIComponent(key)}.pdf`;
}

export function signature(): Signature {
  const logo =
    process.env.SIGNATURE_LOGO_URL?.trim() ||
    (netlifyReady() ? `${demoBaseUrl()}/assets/flowmint-logo.png` : "");
  return {
    name: process.env.SIGNATURE_NAME?.trim() || process.env.OUTREACH_FROM_NAME?.trim() || "",
    title: process.env.SIGNATURE_TITLE?.trim() || "",
    company: "FlowMint",
    website: process.env.SIGNATURE_WEBSITE?.trim() || "https://flowmint.works",
    email: process.env.OUTREACH_SMTP_USER?.trim() || "",
    phone: process.env.SIGNATURE_PHONE?.trim() || "",
    logoUrl: logo,
  };
}

const FILLER = new Set([
  "the", "and", "of", "psychology", "psychologists", "psychological", "therapy", "therapies",
  "counselling", "counseling", "clinic", "centre", "center", "practice", "services", "group", "pty", "ltd",
]);

/** A short ?for= key from the company name, e.g. "Full Potential Psychology" → "fullpotential". */
export function practiceKey(company: string, taken: Set<string>): string {
  const words = company
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter((word) => !FILLER.has(word));
  const base = ((kept.length ? kept : words).join("") || "practice").slice(0, 24);
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}${n}`;
  return key;
}

/** Keys from before the template looked like body-curious-j53b6d. */
export function isLegacyKey(key: string): boolean {
  return !/^[a-z0-9]+$/.test(key);
}

export function safeFileName(name: string): string {
  return name.replace(/[\r\n"\\/]/g, "").trim().slice(0, 120) || "proposal.pdf";
}
