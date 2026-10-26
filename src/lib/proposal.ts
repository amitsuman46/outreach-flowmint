import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import { generateObject, practiceSchema, proposalSchema } from "./ai";
import { BROWSER_USER_AGENT, looksBlocked, screenshotFile, SiteBlockedError } from "./audit";
import { FALLBACK_PRIMARY, parseHex } from "./color";
import { renderDeck } from "./deck-template";
import { syncTemplate } from "./netlify";
import { prisma } from "./prisma";
import {
  type Brand,
  type PracticeContent,
  practiceContentSchema,
  type ProposalContent,
  proposalContentSchema,
  type ProposalView,
} from "./schemas";
import {
  demoPdfUrl,
  demoUrl,
  isLegacyKey,
  practiceKey,
  proposalPdfFile,
  signature,
  siteDir,
} from "./site-config";
import { describeFacts, desktopFacts, detectPlatform, mobileFacts, NAME_SHIM, type SiteFacts } from "./site-facts";
import { templateKeys, writeLeadsScript } from "./template-sync";

const PROPOSAL_SYSTEM_PROMPT = `
You write the content of a short website proposal from FlowMint, a studio that redesigns websites and improves online presence for small businesses, mostly therapy and mental-health practices.

You get the site review findings and the homepage text. Return:
- summary: two or three sentences on how the homepage comes across to a first-time visitor today. Fair and specific, not harsh.
- drawbacks: three to six specific problems you can support from the findings or page text. area is one of seo, design, ux, mobile, conversion, content. impact says in one sentence why it matters to a prospective client or to the business.
- improvements: one improvement per drawback, in the same order. fixes repeats the drawback title it addresses.
- results: three or four expected outcomes, such as easier booking or clearer search listings. Describe the direction of change only. Never give percentages, numbers, rankings, or guarantees.

Use only what you were given. Do not invent pages, tools, reviews, traffic, awards, or prices. Plain, warm English.
`.trim();

/** Fills one entry of the concept template, in the same voice as the hand-written ones. */
const PRACTICE_SYSTEM_PROMPT = `
You fill in one practice entry for FlowMint's concept website template. The template is a calm, modern homepage for an Australian psychology or therapy practice, personalised with the practice's own details. It shows what their site could look like.

Fields:
- name: the business name as written on their site.
- eyebrow: "<type of practice> · <suburb or area>", for example "Psychology & counselling · Norwest & online".
- heroSub: one or two sentences: who they help, with what, and how (in person, telehealth). Warm and specific.
- aboutTitle: "Meet <first name> and the team." for a group practice, or an empty string for a solo practitioner.
- aboutLead: one sentence in their voice, ideally close to a line from their site.
- aboutBody: two sentences about how they work, or an empty string if the text gives too little.
- location: street address or suburb and state, as on their site.
- phone, email, hours: exactly as on their site. If not in the text, use "[Phone]", "[Email]" or "[Opening hours]".
- chips: three or four short trust points for the hero, such as funding schemes or "Free 15-min consult call".
- funding: every funding option the site names, such as Medicare, NDIS, DVA, WorkCover, private health. If none, ["[Funding options]"].
- feeNote: a distinctive fee or values note from the site, or an empty string.
- help: up to eight topic keys from the allowed list, in order of how prominent they are on the site.
- assessments: true only if the site offers assessments.
- footerTag: a short line from the site, such as their tagline.

Use only facts from the input. Never invent clinicians, credentials, prices, reviews or funding schemes. Australian spelling.

Two entries FlowMint wrote by hand, for tone:
{"name":"AMC Psychology","eyebrow":"Psychology for all ages · Wetherill Park, South West Sydney","heroSub":"Compassionate, evidence-based therapy and assessments for children, teens, adults and families. In person, by phone or online.","aboutTitle":"Meet Saja and the team.","aboutLead":"We take the time to understand what you’re experiencing and what matters to you, then match you with a clinician whose expertise fits.","chips":["Medicare","NDIS registered","WorkCover & CTP"],"funding":["Medicare referrals","Private health funds","NDIS (all plan types)","WorkCover & CTP"],"footerTag":"Personalised care, tailored to your needs."}
{"name":"Next Step Psychology","eyebrow":"Psychology & counselling · Norwest & online","heroSub":"Affordable, evidence-based support to help you think, feel and live better, in Norwest or online from anywhere in Australia.","aboutLead":"I’m Ian, a psychologist who believes good mental health support should be practical, evidence-based and affordable.","chips":["Online & in person","Affordable fees","Every session gives back"],"feeNote":"Every booking helps fund Compassion & Opportunity International’s work with families in poverty.","footerTag":"Think, feel & live better."}
`.trim();

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Fields of a practice entry that still show a [placeholder] on the concept page. */
export function placeholdersIn(raw: string): string[] {
  try {
    const parsed = practiceContentSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    const entry = parsed.data;
    const fields: [string, string | string[]][] = [
      ["phone", entry.phone],
      ["email", entry.email],
      ["opening hours", entry.hours],
      ["funding options", entry.funding],
    ];
    return fields
      .filter(([, value]) => (Array.isArray(value) ? value.some((item) => item.startsWith("[")) : value.startsWith("[")))
      .map(([label]) => label);
  } catch {
    return [];
  }
}

async function chooseKey(prospectId: string, company: string, current: string | undefined): Promise<string> {
  if (current && !isLegacyKey(current)) return current;
  const others = await prisma.proposal.findMany({ where: { prospectId: { not: prospectId } }, select: { slug: true } });
  const taken = new Set([...(await templateKeys()).practices, ...others.map((item) => item.slug)]);
  return practiceKey(company, taken);
}

export async function buildProposal(prospectId: string, browser: Browser): Promise<void> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: { audit: true, proposal: true },
  });
  if (!prospect) throw new Error("That person is no longer on the desk");
  if (!prospect.audit) throw new Error("Review the website before building a proposal.");
  if (looksBlocked(prospect.audit.pageText)) throw new SiteBlockedError();
  if (!prospect.audit.reachable) {
    throw new Error("Their website couldn't be opened, so there is nothing to build a concept from. The email doesn't need one.");
  }

  // The latest template from Netlify, so local renders and the next publish match the live site.
  await syncTemplate();
  await ensureSharedAssets(browser);
  const key = await chooseKey(prospectId, prospect.company, prospect.proposal?.slug);
  const helpKeys = (await templateKeys()).help;
  if (!helpKeys.length) throw new Error("Could not read the topic list (HELP) from the template's practices.js.");

  const brand = await captureBrand(browser, prospect.audit.pageUrl);
  const facts = [
    `Company: ${prospect.company}`,
    `Contact: ${prospect.name}, ${prospect.title ?? "—"}`,
    `Website: ${prospect.audit.pageUrl}`,
    `Industry: ${prospect.industry ?? "—"}`,
    `Location: ${[prospect.city, prospect.state, prospect.country].filter(Boolean).join(", ") || "—"}`,
    `Review findings: ${prospect.audit.findings}`,
    `Measured on the live site:\n${describeFacts(brand.facts)}`,
    `Homepage text:\n${(prospect.audit.pageText ?? "").slice(0, 3500)}`,
  ].join("\n\n");

  const content = proposalContentSchema.parse(
    await generateObject<ProposalContent>({
      system: PROPOSAL_SYSTEM_PROMPT,
      prompt: facts,
      schema: proposalSchema,
      writing: true,
    }),
  );
  const generated = await generateObject<Omit<PracticeContent, "firstName" | "initials">>({
    system: PRACTICE_SYSTEM_PROMPT,
    prompt: `${facts}\n\nAllowed help keys: ${helpKeys.join(", ")}`,
    schema: practiceSchema(helpKeys),
    writing: true,
  });
  const firstName = prospect.firstName || prospect.name.split(" ")[0] || "[Name]";
  const practice = practiceContentSchema.parse({
    ...generated,
    firstName,
    initials: initialsOf(prospect.name) || initialsOf(prospect.company),
    help: generated.help.filter((item) => helpKeys.includes(item)).slice(0, 8),
  });

  const data = {
    slug: key,
    content: JSON.stringify(content),
    site: JSON.stringify(practice),
    brand: JSON.stringify(brand),
    hasPdf: false,
    builtAt: new Date(),
    deployError: null,
  };
  await prisma.proposal.upsert({
    where: { prospectId },
    create: { prospectId, ...data },
    update: data,
  });
  await writeLeadsScript();

  await renderProposalPdf(prospectId, browser);
  await prisma.proposal.update({ where: { prospectId }, data: { hasPdf: true, builtAt: new Date() } });
}

/** Renders the PDF from the saved proposal, without new AI calls. Used by builds and to redo layouts. */
export async function renderProposalPdf(prospectId: string, browser: Browser): Promise<void> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: { audit: true, proposal: true },
  });
  if (!prospect?.audit || !prospect.proposal) throw new Error("Build the proposal first.");
  const key = prospect.proposal.slug;
  const content = proposalContentSchema.parse(JSON.parse(prospect.proposal.content));
  const demoShot = await screenshotConcept(browser, key);
  const homepage = await readFile(screenshotFile(prospectId)).catch(() => null);
  const homepageJpeg = homepage ? await toJpeg(browser, homepage) : null;
  const deck = renderDeck({
    company: prospect.company,
    personName: prospect.name,
    personTitle: prospect.title,
    pageUrl: prospect.audit.pageUrl,
    demoUrl: demoUrl(key),
    proposal: content,
    homepageJpeg: homepageJpeg && `data:image/jpeg;base64,${homepageJpeg.toString("base64")}`,
    demoJpeg: demoShot && `data:image/jpeg;base64,${demoShot.toString("base64")}`,
    signature: signature(),
    date: new Date(),
  });
  await mkdir(path.dirname(proposalPdfFile(key)), { recursive: true });
  await renderPdf(browser, deck, proposalPdfFile(key));
}

/**
 * The FlowMint logo used in email signatures. Nothing else goes at the site root:
 * the live site may already have its own homepage, which publishing keeps.
 */
async function ensureSharedAssets(browser: Browser): Promise<void> {
  const root = siteDir();
  await mkdir(path.join(root, "assets"), { recursive: true });
  const logo = path.join(root, "assets", "flowmint-logo.png");
  if (existsSync(logo)) return;
  const page = await browser.newPage({ viewport: { width: 96, height: 96 } });
  try {
    const svg = await readFile(path.join(process.cwd(), "storage", "brand", "flowmint-logo.svg"), "utf8").catch(
      () => null,
    );
    if (!svg) return;
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg width="96" height="96" ')}</body></html>`,
    );
    await writeFile(logo, await page.locator("svg").screenshot({ omitBackground: true }));
  } finally {
    await page.close();
  }
}

async function captureBrand(browser: Browser, url: string): Promise<Brand> {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    userAgent: BROWSER_USER_AGENT,
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(1200);
    await page.evaluate(NAME_SHIM);
    const found = await page.evaluate(() => {
      const scores = new Map<string, number>();
      const add = (value: string, weight: number) => {
        const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m || (m[4] !== undefined && Number(m[4]) < 0.6)) return;
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        const max = Math.max(r, g, b) / 255;
        const min = Math.min(r, g, b) / 255;
        const light = (max + min) / 2;
        const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
        if (sat < 0.25 || light < 0.12 || light > 0.85) return;
        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        scores.set(hex, (scores.get(hex) ?? 0) + weight);
      };
      const nodes = document.querySelectorAll(
        "header, nav, a, button, h1, h2, h3, footer, [class*=btn], [class*=button]",
      );
      nodes.forEach((node, index) => {
        if (index > 600) return;
        const style = getComputedStyle(node);
        const isButton = node.matches("button, [class*=btn], [class*=button]");
        add(style.backgroundColor, isButton ? 6 : 2);
        add(style.color, 1);
      });
      const primary = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const bookPattern = /book|schedule|appointment|consult|get started|request|contact/i;
      const booking = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find(
        (a) => bookPattern.test(a.innerText) && /^https?:/.test(a.href) && !a.href.includes("#"),
      );
      return { primary, bookingUrl: booking?.href ?? null };
    });
    let facts: SiteFacts | null = null;
    try {
      const desktop = await desktopFacts(page);
      facts = {
        headline: desktop.headline,
        menuLinks: desktop.menuLinks,
        bookingLabels: desktop.bookingLabels,
        desktopBookingAboveFold: desktop.desktopBookingAboveFold,
        bookingPlatform: detectPlatform(desktop.urls),
        mobile: await mobileFacts(browser, url),
      };
    } catch {
      facts = null;
    }
    return {
      primary: found.primary && parseHex(found.primary) ? found.primary : FALLBACK_PRIMARY,
      logo: null,
      bookingUrl: found.bookingUrl,
      facts,
    };
  } catch {
    return { primary: FALLBACK_PRIMARY, logo: null, bookingUrl: null, facts: null };
  } finally {
    await page.close();
  }
}

/** The local template, personalised with ?for=<key>, as it will look once published. */
async function screenshotConcept(browser: Browser, key: string): Promise<Buffer | null> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    const url = `${pathToFileURL(path.join(siteDir(), "index.html")).href}?for=${encodeURIComponent(key)}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    return await page.screenshot({ type: "jpeg", quality: 78 });
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

async function toJpeg(browser: Browser, png: Buffer): Promise<Buffer | null> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.setContent(
      `<html><body style="margin:0"><img src="data:image/png;base64,${png.toString("base64")}" style="display:block;width:1280px"></body></html>`,
    );
    return await page.screenshot({ type: "jpeg", quality: 75 });
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

async function renderPdf(browser: Browser, html: string, file: string): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 20_000 }).catch(() => undefined);
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);
    const pdf = await page.pdf({
      width: "1280px",
      height: "720px",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    await writeFile(file, pdf);
  } finally {
    await page.close();
  }
}

export function toProposalView(proposal: {
  slug: string;
  content: string;
  site: string;
  hasPdf: boolean;
  builtAt: Date;
  deployedAt: Date | null;
  deployError: string | null;
}): ProposalView {
  let content: ProposalContent = { summary: "", drawbacks: [], improvements: [], results: [] };
  try {
    const parsed = proposalContentSchema.safeParse(JSON.parse(proposal.content));
    if (parsed.success) content = parsed.data;
  } catch {
    // Keep the empty shape.
  }
  return {
    slug: proposal.slug,
    placeholders: placeholdersIn(proposal.site),
    demoUrl: demoUrl(proposal.slug),
    pdfUrl: demoPdfUrl(proposal.slug),
    hasPdf: proposal.hasPdf,
    builtAt: proposal.builtAt.toISOString(),
    deployedAt: proposal.deployedAt?.toISOString() ?? null,
    deployError: proposal.deployError,
    needsDeploy: !proposal.deployedAt || proposal.deployedAt < proposal.builtAt,
    content,
  };
}

export async function pendingDeploys(): Promise<number> {
  const all = await prisma.proposal.findMany({ select: { builtAt: true, deployedAt: true } });
  return all.filter((item) => !item.deployedAt || item.deployedAt < item.builtAt).length;
}
