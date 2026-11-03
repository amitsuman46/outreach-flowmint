import { CONCEPT_LINK, TEMPLATE_LINK, titleCase } from "./email-template";
import { draftSchema, generateObject } from "./ai";
import { ensureOptOut, OPT_OUT_LINE } from "./opt-out";
import { prisma } from "./prisma";
import { practiceContentSchema, proposalContentSchema, type Brand } from "./schemas";
import { describeFacts, type SiteFacts } from "./site-facts";

/** What FlowMint does, in the words every first email uses to introduce it. */
const ABOUT_FLOWMINT =
  "FlowMint is a small studio that builds websites for therapy and psychology practices and sets up simple AI and automation behind them, so more of the right people get in touch and book, and the team spends less time on admin.";

/**
 * Growth ideas the model chooses from. Each has the signal in the input that makes it fit,
 * so two practices with different sites get different ideas.
 */
const GROWTH_IDEAS = `
- A friendly AI assistant on the website that answers common questions day and night (fees, Medicare or NDIS rebates, wait times, which clinician suits what) and hands real enquiries to the team. Fits when the site has a lot of information to dig through, many services, or no quick way to ask a question.
- Online booking built into the site with automatic text and email reminders, so fewer sessions are missed. Fits when no booking platform was detected. If one was detected, offer automatic reminders and follow-ups that work with that platform and say the booking itself stays exactly as it is.
- An instant reply and a simple online intake form for every new enquiry, so a worried person hears back within minutes and the team has their details before the first session. Fits when the only way in is a phone number, an email address or a basic contact form.
- An automatic waitlist that tells people when a spot opens, so nobody slips through the cracks. Fits when the site mentions a waitlist, closed books or limited availability.
- A clear page and quick form for GPs and other referrers, with automatic confirmation. Fits when the practice takes referrals, mental health care plans or NDIS clients.
- Gentle automatic follow-ups after a first session, such as a check-in or a request for a Google review. Fits a growing practice that wants more people to find and trust it.
- Help being found by local people searching on Google for the kind of support they offer. Fits when the homepage doesn't clearly say what they help with or where they are.
`.trim();

const SHARED_RULES = `
Rules:
- Australian spelling. Short sentences. Contractions are fine. Warm, plain and specific, like one thoughtful person wrote it after really looking at their site, not like marketing and not like AI.
- Plain words a psychologist would use. "AI" and "automation" are fine, always explained in terms of what it does for their clients or their team. Never use: SEO, UX, UI, H1, CTA, call-to-action, conversion, keywords, optimise, optimize, enhance, leverage, elevate, seamless, streamline, boost, robust, tailored, user experience, search relevance, digital presence, online presence.
- Never open with "I hope", "I came across your website", or "I noticed that". No "Additionally", "Furthermore" or "Moreover". No em dashes. No exclamation marks.
- Use only facts from the input. Never invent numbers, results, clients, prices, reviews, or problems. Ideas for the future are offers ("we could set up..."), never claims about what they have now unless the input shows it.
- The growth section must be specific to this practice. Say in each item why it suits them, using what is in the input (their services, who they see, their booking setup, what is on the homepage). Never a generic list.

Subject line: under 55 characters, in Title Case (every word starts with a capital letter), specific to this practice and what they would gain. Never "Ideas for <company> website" or anything generic.

Return JSON with subject and body.
`.trim();

/** Both modes share one structure; only the example-site paragraph differs. */
function designedPrompt(kind: "concept" | "template"): string {
  const showcase =
    kind === "concept"
      ? `5. If a concept page exists: one sentence such as "I built a redesign with <practice>'s name on it, so you can see these ideas in place:", then the next line is exactly ${CONCEPT_LINK} on its own. If no concept page exists, skip this part and the link marker. Do not mention a PDF, deck or attachment; a line about it is added under the link automatically.`
      : `5. One sentence introducing a website FlowMint built in the same style, as an example of the kind of site we would make for them. It is not their site and not a redesign of it. Then the next line is exactly ${TEMPLATE_LINK} on its own.`;
  const link = kind === "concept" ? CONCEPT_LINK : TEMPLATE_LINK;
  const showcaseExample =
    kind === "concept"
      ? `I built a redesign with your practice's name on it, so you can see these ideas in place:\n${CONCEPT_LINK}`
      : `Here's a site we built in the same spirit, so you can see the style we'd bring to yours:\n${TEMPLATE_LINK}`;

  return `
You write a first cold email from a designer at FlowMint. ${ABOUT_FLOWMINT} The reader is a busy practice owner or psychologist. The email is a short, personal proposal shown in a colourful designed layout, so follow the structure and markup exactly.

Structure, each part separated by a blank line:
1. "Hi <first name>,"
2. "## Quick introduction" then exactly two sentences in one paragraph. First: who we are and what we do (FlowMint builds websites for therapy and psychology practices and sets up AI and automation that bring in more of the right clients and cut admin). Second: genuine, specific praise for something distinctive about their practice, from the page text, quoting their own words when there is a good line, and why that made you write.
3. "## What could work better" then two or three items, each on its own line as "- **<short title>**: <what a visitor feels now, from their side>. <What we would change.>" Use the measured facts when they exist (number of menu links, different booking button labels, nothing to tap on a phone, a popup covering the screen). No technical words. If an online booking platform was detected, say it stays exactly as it is.
4. "## How we can help you grow" then two or three items, "- **<short title>**: <one or two sentences>", chosen from the growth ideas below to fit this practice. Each one says what we would set up and what it means for their clients or their team. Direction of change only, never numbers, percentages or guarantees.
${showcase}
6. "## Let's talk" then one paragraph of two sentences proposing a 15-minute call: what we would cover (walk through these ideas on their own site and pick the one or two that would help most first) and an easy ask, such as whether a quick call this week or next would suit. No pressure, no obligation wording like "no strings attached".
7. "Warmly," on its own line. No name after it; the signature is added automatically.
8. This exact line: ${OPT_OUT_LINE}

Growth ideas to choose from (pick the ones the input supports, and reword them for this practice):
${GROWTH_IDEAS}

Length: 200 to 340 words before the opt-out line.

${SHARED_RULES}

Example of the tone and structure (do not reuse its facts or sentences):

Subject: Helping Worried Parents Reach Miranda Sooner
Hi Miranda,

## Quick introduction
I'm with FlowMint, a small studio that builds websites for psychology practices and sets up simple AI and automation so more of the right families get in touch and your team spends less time on admin. Your site describes your work as "warm and compassionate", and the range you offer, from children through to adults plus EMDR and assessments, is exactly why I wanted to reach out.

## What could work better
- **Nothing to tap on a phone**: A parent on their phone sees no message, number or way to book on the first screen. We'd put "Book" and "Call" one tap away.
- **Your specialities are hidden**: EMDR and assessments only appear deep in the menu. We'd lead with what you help with, so families know straight away they're in the right place.

## How we can help you grow
- **Answers at 10pm**: Parents often search late at night. An AI assistant on your site could answer questions about assessments, fees and wait times, then pass genuine enquiries to your team.
- **A quick reply to every enquiry**: An instant response and a short intake form means a worried parent hears back within minutes, and you have their details before the first session.
- **Fewer missed sessions**: Automatic text and email reminders that work alongside your current booking setup.

${showcaseExample}

## Let's talk
I'd love to walk you through these ideas on your own site and work out which one or two would make the biggest difference first. Would a 15-minute call this week or next suit you?

Warmly,
${OPT_OUT_LINE}

Write a new email for the practice in the input. The link marker in this mode is ${link}.
`.trim();
}

const DRAFT_SYSTEM_PROMPT = designedPrompt("concept");
const TEMPLATE_DRAFT_SYSTEM_PROMPT = designedPrompt("template");

const BANNED: [RegExp, string][] = [
  [/\b(seo|ux|ui|h1|cta)\b/i, "technical abbreviations"],
  [/call[- ]to[- ]action|conversion|keyword|search relevance|user experience|digital presence|online presence/i, "jargon"],
  [/optimi[sz]|enhanc|leverag|elevat|seamless|streamlin|\bboost|robust|tailored|cutting[- ]edge|game[- ]changer|unlock/i, "marketing words"],
  [/additionally|furthermore|moreover/i, "essay connectors"],
  [/i hope (this|you)|came across your (website|site)|i noticed that/i, "stock openers"],
  [/—/, "em dashes"],
  [/!/, "exclamation marks"],
];
const DECK_MENTION: [RegExp, string] = [/\b(pdf|deck|attach)/i, "a mention of the PDF or deck (it is added automatically)"];

const SECTIONS: [RegExp, string][] = [
  [/^##\s+quick introduction/im, "## Quick introduction"],
  [/^##\s+what could work better/im, "## What could work better"],
  [/^##\s+how we can help you grow/im, "## How we can help you grow"],
  [/^##\s+let.?s talk/im, "## Let's talk"],
];

/** Checks shared by both modes. `link` is the marker this draft must (or must not) carry. */
function designedProblems(subject: string, body: string, link: string | null, banned: [RegExp, string][]): string[] {
  const text = `${subject}\n${body.replace(OPT_OUT_LINE, "")}`;
  const problems = banned.filter(([pattern]) => pattern.test(text)).map(([, label]) => `uses ${label}`);
  const words = body
    .replace(OPT_OUT_LINE, "")
    .replace(CONCEPT_LINK, "")
    .replace(TEMPLATE_LINK, "")
    .replace(/[#*]/g, "")
    .split(/\s+/)
    .filter(Boolean).length;
  if (words < 180) problems.push(`is too short (${words} words)`);
  if (words > 400) problems.push(`is too long (${words} words)`);
  const missing = SECTIONS.filter(([pattern]) => !pattern.test(body)).map(([, label]) => `"${label}"`);
  if (missing.length) problems.push(`is missing the section${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`);
  for (const section of body.split(/^##\s+/m).slice(1)) {
    const name = section.split("\n")[0].trim().toLowerCase();
    if (!/what could work better|how we can help/.test(name)) continue;
    if ((section.match(/^\s*-\s+\*\*.+?\*\*/gm) ?? []).length < 2) {
      problems.push(`has fewer than two "- **Title**: sentence" items under "${section.split("\n")[0].trim()}"`);
    }
  }
  const introSection = body.split(/^##\s+/m).find((section) => /^quick introduction/i.test(section)) ?? "";
  const intro = introSection.split("\n").slice(1).join(" ").trim();
  if (intro && (intro.match(/[.?]["”']?(\s|$)/g) ?? []).length > 3) problems.push("has a quick introduction longer than two sentences");
  if (link) {
    const pattern = new RegExp(`^[ \\t]*${link.replace(/[{}]/g, "\\$&")}[ \\t]*$`, "m");
    if (!pattern.test(body)) problems.push(`does not have ${link} alone on its own line`);
  } else if (body.includes(CONCEPT_LINK) || body.includes(TEMPLATE_LINK)) {
    problems.push("uses a link marker, but no concept page exists");
  }
  if (!/^warmly,[ \t]*$/im.test(body)) problems.push('does not have "Warmly," alone on its own line');
  if (subject.length > 60) problems.push("has a subject over 60 characters");
  if (/^ideas for/i.test(subject.trim())) problems.push("has a generic subject");
  return problems;
}

export function draftProblems(subject: string, body: string, needsLink: boolean): string[] {
  return designedProblems(subject, body, needsLink ? CONCEPT_LINK : null, [...BANNED, DECK_MENTION]);
}

export function templateDraftProblems(subject: string, body: string): string[] {
  return designedProblems(subject, body, TEMPLATE_LINK, BANNED);
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, raw: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? (result.data as T) : null;
  } catch {
    return null;
  }
}

function parseFacts(raw: string | null | undefined): SiteFacts | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SiteFacts;
  } catch {
    return null;
  }
}

/**
 * When the site could not be opened there is no review to build on, so the email changes.
 * down: it timed out or did not respond, which is worth telling them, kindly and from our side.
 * blocked: a firewall stopped our browser; the site is probably fine, so never imply otherwise.
 */
function unreachablePrompt(reason: "down" | "blocked", detail: string, template: boolean): string {
  return `
You write a short first cold email from a designer at FlowMint. ${ABOUT_FLOWMINT} This time the practice's website could not be reviewed, so the email cannot mention anything specific about the site's content or design.

${
  reason === "down"
    ? `When we tried to open their website it did not load for us (${detail}). In one plain, kind sentence, say that when you tried to open their site this week it didn't load for you. Speak only for yourself, say it may be temporary, and never claim it is broken for everyone. In one more sentence say why it matters: someone looking for support may give up before they find the practice.`
    : `Do not mention any problem with their website, and do not say you could not open it. Instead, in one sentence, say what FlowMint does for practices like theirs: calm, clear websites that make it easy to book, plus simple AI and automation such as instant replies to enquiries and appointment reminders. Make no claim about their current site.`
}

Structure, each part separated by a blank line:
1. "Hi <first name>,"
2. One or two sentences specific to the practice, using only the details given (location, focus, keywords, title). If the details are thin, keep it simple rather than invent anything.
3. ${reason === "down" ? "The two sentences about the site not loading." : "The sentence about what FlowMint does."}
${
  template
    ? `4. One sentence introducing a website FlowMint built for a practice like theirs, as an example of the style. It is not their site.
5. ${TEMPLATE_LINK} alone on its own line.
6.`
    : "4."
} One short question offering a 15-minute call${reason === "down" ? " to help get it sorted" : ""}.
${template ? "7." : "5."} "Warmly," on its own line. No name after it.
${template ? "8." : "6."} This exact line: ${OPT_OUT_LINE}

Rules:
- 70 to 140 words before the opt-out line. Short sentences. Contractions are fine. Australian spelling.
- Plain words. Never use: SEO, UX, UI, H1, CTA, call-to-action, conversion, keywords, optimise, optimize, enhance, leverage, elevate, seamless, streamline, boost, robust, tailored, user experience, digital presence, online presence.
- Never open with "I hope" or "I came across your website". No "Additionally", "Furthermore" or "Moreover". No em dashes. No exclamation marks. No bullet points or headings.
- Use only facts from the input. Never invent problems, numbers, results or clients.

Subject line: under 55 characters, in Title Case (every word starts with a capital letter), specific to this practice.${
    reason === "down" ? ' For example "Your Website Didn\'t Load For Me".' : ""
  }

Return JSON with subject and body.
`.trim();
}

export function unreachableDraftProblems(subject: string, body: string, template: boolean): string[] {
  const text = `${subject}\n${body.replace(OPT_OUT_LINE, "")}`;
  const problems = BANNED.filter(([pattern]) => pattern.test(text)).map(([, label]) => `uses ${label}`);
  const words = body.replace(OPT_OUT_LINE, "").replace(TEMPLATE_LINK, "").split(/\s+/).filter(Boolean).length;
  if (words < 60) problems.push(`is too short (${words} words)`);
  if (words > 170) problems.push(`is too long (${words} words)`);
  if (template && !/^[ \t]*\{\{template_link\}\}[ \t]*$/m.test(body)) problems.push(`does not have ${TEMPLATE_LINK} alone on its own line`);
  if (!template && body.includes("{{")) problems.push("contains a {{marker}}, which this email must not use");
  if (/^\s*(##|[-*•]\s)/m.test(body)) problems.push("uses headings or bullet points");
  if (!/^warmly,[ \t]*$/im.test(body)) problems.push('does not have "Warmly," alone on its own line');
  if (subject.length > 60) problems.push("has a subject over 60 characters");
  return problems;
}


function parseBrand(raw: string): Brand | null {
  try {
    return JSON.parse(raw) as Brand;
  } catch {
    return null;
  }
}

/** Writes (or rewrites) the draft for one lead. Returns any style problems that survived the retries. */
export async function writeDraft(id: string): Promise<string[]> {
  const prospect = await prisma.prospect.findUnique({
    where: { id },
    include: { audit: true, proposal: true },
  });
  if (!prospect?.audit) return [];

  const template = prospect.mode === "template";
  const unreachable = !prospect.audit.reachable;
  const reason: "down" | "blocked" = prospect.audit.unreachableReason === "blocked" ? "blocked" : "down";
  const reasonDetail = (prospect.audit.unreachableReason ?? "").replace(/^down:\s*/, "");
  const brand = prospect.proposal ? parseBrand(prospect.proposal.brand) : null;
  const practice = prospect.proposal ? parse(practiceContentSchema, prospect.proposal.site) : null;
  const proposal = prospect.proposal ? parse(proposalContentSchema, prospect.proposal.content) : null;
  const hasConcept = Boolean(prospect.proposal);
  // Facts come from the site review; older leads only have them from the concept build.
  const facts = parseFacts(prospect.audit.facts) ?? brand?.facts ?? null;

  const about = [
    `To: ${prospect.firstName || prospect.name.split(" ")[0]} (${prospect.name}), ${prospect.title ?? "—"} at ${prospect.company}`,
    `Website: ${prospect.website ?? prospect.audit.pageUrl}`,
    `Industry: ${prospect.industry ?? "—"}`,
    `Location: ${[prospect.city, prospect.state, prospect.country].filter(Boolean).join(", ") || "—"}`,
    `Employees: ${prospect.employees ?? "—"}`,
    `Keywords: ${(prospect.keywords ?? "—").slice(0, 600)}`,
  ].join("\n");

  const prompt = unreachable ? about : [
    `To: ${prospect.firstName || prospect.name.split(" ")[0]} (${prospect.name}), ${prospect.title ?? "—"} at ${prospect.company}`,
    `Website: ${prospect.audit.pageUrl}`,
    `Measured on the live site:\n${describeFacts(facts)}`,
    `Review findings: ${prospect.audit.findings}`,
    practice
      ? `About the practice (from their site): ${[practice.eyebrow, practice.heroSub, ...practice.chips, ...practice.funding]
          .filter((item) => item && !item.startsWith("["))
          .join("; ")}`
      : "",
    proposal?.improvements.length
      ? `What the concept page changes:\n${proposal.improvements.map((item) => `- ${item.title}: ${item.detail}`).join("\n")}`
      : "",
    `Homepage text:\n${(prospect.audit.pageText ?? "").slice(0, 2500)}`,
    template
      ? ""
      : hasConcept
        ? "A concept page exists. Put the link marker on its own line just before the \"## Let's talk\" section."
        : "No concept page exists. Do not use the link marker.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let best: { subject: string; body: string; problems: string[] } | null = null;
  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await generateObject<{ subject?: string; body?: string }>({
      system: unreachable
        ? unreachablePrompt(reason, reasonDetail, template)
        : template
          ? TEMPLATE_DRAFT_SYSTEM_PROMPT
          : DRAFT_SYSTEM_PROMPT,
      prompt: feedback ? `${prompt}\n\nYour last draft broke these rules: ${feedback}. Write it again and fix them.` : prompt,
      schema: draftSchema,
      writing: true,
    });
    const subject = titleCase((result.subject ?? "").replace(/\s+/g, " ").trim().slice(0, 200));
    const body = (result.body ?? "")
      .replace(/\r\n/g, "\n")
      .trim()
      // "Hi Jonn, I was looking..." reads as a run-on. The greeting gets its own line.
      .replace(/^((?:hi|hello|dear)\s+[^,\n]{1,40},)[ \t]+/i, "$1\n\n");
    if (!subject || !body) continue;
    const problems = unreachable
      ? unreachableDraftProblems(subject, body, template)
      : template
        ? templateDraftProblems(subject, body)
        : draftProblems(subject, body, hasConcept);
    if (!best || problems.length < best.problems.length) best = { subject, body, problems };
    if (!problems.length) break;
    feedback = problems.join("; ");
  }
  if (!best) throw new Error("The model returned an empty draft. Try again.");

  const body = ensureOptOut(best.body);
  const existing = await prisma.outreachMessage.findFirst({
    where: { prospectId: id, status: "draft" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    await prisma.outreachMessage.update({
      where: { id: existing.id },
      data: { subject: best.subject, body, error: null },
    });
  } else {
    await prisma.outreachMessage.create({
      data: { prospectId: id, subject: best.subject, body, status: "draft" },
    });
  }
  await prisma.prospect.update({
    where: { id },
    data: {
      status: "drafted",
      lastError: best.problems.length ? `Draft check: it still ${best.problems.join(", ")}. Edit before sending.` : null,
    },
  });
  return best.problems;
}
