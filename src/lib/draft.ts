import { CONCEPT_LINK, TEMPLATE_LINK, titleCase } from "./email-template";
import { draftSchema, generateObject } from "./ai";
import { ensureOptOut, OPT_OUT_LINE } from "./opt-out";
import { prisma } from "./prisma";
import { practiceContentSchema, proposalContentSchema, type Brand } from "./schemas";
import { describeFacts, type SiteFacts } from "./site-facts";

/**
 * The style comes from the emails FlowMint sent by hand in October 2026, which are the
 * benchmark: a real compliment, two or three problems a visitor would feel, the concept
 * link on its own line, what the concept changes, and a 15-minute call.
 */
const DRAFT_SYSTEM_PROMPT = `
You write a first cold email from a designer at FlowMint, a small studio that redesigns websites for therapy and psychology practices. The reader is a busy practice owner or psychologist. It must read like one thoughtful person wrote it after really looking at their site, not like marketing and not like AI.

Structure, in this order, each as its own short paragraph:
1. "Hi <first name>," then one or two sentences of genuine, specific praise for something distinctive about the practice, taken from the page text. Quote their own words when there is a good line. Never generic praise like "great website".
2. Start with "At the moment, though," or "I noticed the website doesn't ... though." Name two or three concrete problems a visitor would feel, using the measured facts when they exist (numbers of menu links, different booking button names, nothing to tap on a phone, a popup covering the screen). Describe them from the visitor's side, for example "a worried parent has to go digging". No technical words.
3. One line introducing the concept, such as "So I built a redesign with <practice>'s name on it:" or "I built a redesign to show what it could look like:". Then the next line is exactly ${CONCEPT_LINK} on its own.
4. Two sentences on what the redesign changes, matched to the problems in paragraph 2. If an online booking platform was detected, say the redesign keeps their <platform> booking exactly as it is.
5. One short question asking for a 15-minute call to look at it together.
6. "Warmly," on its own line. Do not write a name after it. The signature is added automatically.
7. Then this exact line: ${OPT_OUT_LINE}

Rules:
- 90 to 140 words before the opt-out line. Short sentences. Contractions are fine.
- Plain words a psychologist would use. Never use: SEO, UX, UI, H1, CTA, call-to-action, conversion, keywords, optimise, optimize, enhance, leverage, elevate, seamless, streamline, boost, robust, tailored, user experience, search relevance, digital presence, online presence.
- Never open with "I hope", "I came across your website", or "I noticed that". No "Additionally", "Furthermore" or "Moreover". No em dashes. No exclamation marks. No bullet points.
- Do not mention a PDF, deck or attachment. A line about it is added under the link automatically.
- Use only facts from the input. Never invent numbers, results, clients, prices, or problems.
- If no concept page exists, skip paragraphs 3 and 4 and offer to sketch one instead.

Subject line: under 55 characters, in Title Case (every word starts with a capital letter), specific to this practice and the visitor benefit. Add " (Demo Inside)" only when it still fits. Never "Ideas for <company> website" or anything generic.

Two emails FlowMint sent that got the tone right:

Subject: A Calmer Website For Next Step (Demo Inside)
Hi Ian,

I came across Next Step and loved that every session also supports Compassion & Opportunity International. That's a story most practices can't tell.

I noticed the website doesn't lead with it, though. On a phone, the cookie notice and chat bubble cover most of the first screen, and the homepage doesn't yet show what you help with or what sessions cost.

So I built a quick redesign with Next Step's name on it:
${CONCEPT_LINK}

It keeps your Splose booking exactly as it is and puts "Book a session" one tap away on every page.

Would you be open to a 15-minute call to look at it together?

Warmly,
${OPT_OUT_LINE}

Subject: Helping Parents Find You Faster (Demo Inside)
Hi Miranda,

Your site describes your work as warm and compassionate, and the range you offer is wonderful: children through to adults, plus EMDR and autism and ADHD assessments.

Right now, though, the homepage doesn't show any of that. On a phone there's no message, phone number or way to book, so a worried parent has to go digging.

I built a redesign to show how it could feel instead:
${CONCEPT_LINK}

It puts your specialities and funding options on the first screen, with "Book" and "Call" one tap away.

Would a 15-minute call to look at it together be useful?

Warmly,
${OPT_OUT_LINE}

Write a new email for the practice in the input. Do not reuse the facts or sentences of these examples.

Return JSON with subject and body.
`.trim();

const BANNED: [RegExp, string][] = [
  [/\b(seo|ux|ui|h1|cta)\b/i, "technical abbreviations"],
  [/call[- ]to[- ]action|conversion|keyword|search relevance|user experience|digital presence|online presence/i, "jargon"],
  [/optimi[sz]|enhanc|leverag|elevat|seamless|streamlin|\bboost|robust|tailored|cutting[- ]edge|game[- ]changer|unlock/i, "marketing words"],
  [/additionally|furthermore|moreover/i, "essay connectors"],
  [/i hope (this|you)|came across your (website|site)|i noticed that/i, "stock openers"],
  [/—/, "em dashes"],
  [/!/, "exclamation marks"],
  [/\b(pdf|deck|attach)/i, "a mention of the PDF or deck (it is added automatically)"],
];

export function draftProblems(subject: string, body: string, needsLink: boolean): string[] {
  const text = `${subject}\n${body.replace(OPT_OUT_LINE, "")}`;
  const problems = BANNED.filter(([pattern]) => pattern.test(text)).map(([, label]) => `uses ${label}`);
  const words = body.replace(OPT_OUT_LINE, "").replace(CONCEPT_LINK, "").split(/\s+/).filter(Boolean).length;
  if (words < 70) problems.push(`is too short (${words} words)`);
  if (words > 165) problems.push(`is too long (${words} words)`);
  if (needsLink && !/^[ \t]*\{\{concept_link\}\}[ \t]*$/m.test(body)) {
    problems.push(`does not have ${CONCEPT_LINK} alone on its own line`);
  }
  if (!/^warmly,[ \t]*$/im.test(body)) problems.push('does not have "Warmly," alone on its own line');
  const paragraphs = body.replace(OPT_OUT_LINE, "").split(/\n\s*\n/).filter((block) => block.trim()).length;
  if (paragraphs < 5) problems.push("is not split into short paragraphs with blank lines between them");
  if (subject.length > 60) problems.push("has a subject over 60 characters");
  if (/^ideas for/i.test(subject.trim())) problems.push("has a generic subject");
  return problems;
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, raw: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? (result.data as T) : null;
  } catch {
    return null;
  }
}

/**
 * "Without PPT": no concept or PDF. The proposal is the email itself, short and scannable,
 * with one shared template site shown as an example of the work.
 */
const TEMPLATE_DRAFT_SYSTEM_PROMPT = `
You write a first cold email from a designer at FlowMint, a small studio that redesigns websites for therapy and psychology practices. The email itself is a short, personal proposal. It is shown in a designed layout, so follow the structure exactly. It must read like one thoughtful person wrote it after really looking at their site, not like marketing and not like AI.

Structure, each part separated by a blank line:
1. "Hi <first name>,"
2. One or two sentences of genuine, specific praise for something distinctive about the practice, from the page text. Quote their own words when there is a good line.
3. One sentence saying you spent some time on their website and noted a few ideas. Keep it plain.
4. "## What I noticed" then two or three items, each on its own line as "- **<short title>**: <one sentence>". Concrete problems a visitor would feel, using the measured facts when they exist (number of menu links, different booking button labels, nothing to tap on a phone, a popup covering the screen). Visitor's point of view, no technical words.
5. "## What I'd change" then the same number of items in the same order, "- **<short title>**: <one sentence>". If an online booking platform was detected, say it stays exactly as it is.
6. "## What this should do for you" then two or three items, "- **<short title>**: <one sentence>". Direction of change only. Never numbers, percentages or guarantees.
7. One sentence introducing a website FlowMint built in the same style, as an example of the kind of site you would make for them. It is not their site and not a redesign of it.
8. ${TEMPLATE_LINK} alone on its own line.
9. One short question asking for a 15-minute call to talk it through.
10. "Warmly," on its own line. No name after it; the signature is added automatically.
11. This exact line: ${OPT_OUT_LINE}

Rules:
- 160 to 260 words before the opt-out line. Short sentences. Contractions are fine. Australian spelling.
- Plain words a psychologist would use. Never use: SEO, UX, UI, H1, CTA, call-to-action, conversion, keywords, optimise, optimize, enhance, leverage, elevate, seamless, streamline, boost, robust, tailored, user experience, search relevance, digital presence, online presence.
- Never open with "I hope", "I came across your website", or "I noticed that". No "Additionally", "Furthermore" or "Moreover". No em dashes. No exclamation marks.
- Use only facts from the input. Never invent numbers, results, clients, prices, or problems.

Subject line: under 55 characters, in Title Case (every word starts with a capital letter), specific to this practice and what they would gain. Never "Ideas for <company> website" or anything generic.

Example of the tone and structure (do not reuse its facts):

Subject: Helping Worried Parents Find Miranda Faster
Hi Miranda,

Your site describes your work as warm and compassionate, and the range you offer is wonderful: children through to adults, plus EMDR and autism and ADHD assessments.

I spent some time on your website and noted a few ideas.

## What I noticed
- **Nothing to tap on a phone**: The first screen has no message, phone number or way to book, so a parent has to go digging.
- **Your specialities are hidden**: EMDR and assessments only appear deep in the menu.

## What I'd change
- **Book and Call up top**: Put both one tap away on the first screen.
- **Lead with what you do**: Show your specialities and funding options before anything else.

## What this should do for you
- **Easier first contact**: Parents can reach you the moment they decide to.
- **A clearer first impression**: Visitors see straight away that you can help.

Here's a site we built in the same spirit, so you can see the style we'd bring to yours:
${TEMPLATE_LINK}

Would a 15-minute call to talk it through be useful?

Warmly,
${OPT_OUT_LINE}

Return JSON with subject and body.
`.trim();

const TEMPLATE_SECTIONS = [/^##\s+what i noticed/im, /^##\s+what i.?d change/im, /^##\s+what this should do for you/im];

export function templateDraftProblems(subject: string, body: string): string[] {
  const text = `${subject}\n${body.replace(OPT_OUT_LINE, "")}`;
  const problems = BANNED.filter(([pattern]) => pattern.test(text)).map(([, label]) => `uses ${label}`);
  const words = body.replace(OPT_OUT_LINE, "").replace(TEMPLATE_LINK, "").replace(/[#*]/g, "").split(/\s+/).filter(Boolean).length;
  if (words < 140) problems.push(`is too short (${words} words)`);
  if (words > 300) problems.push(`is too long (${words} words)`);
  if (TEMPLATE_SECTIONS.some((pattern) => !pattern.test(body))) {
    problems.push('is missing one of the sections "## What I noticed", "## What I\'d change", "## What this should do for you"');
  }
  const sections = body.split(/^##\s+/m).slice(1);
  if (sections.some((section) => (section.match(/^\s*-\s+\*\*.+?\*\*/gm) ?? []).length < 2)) {
    problems.push('has a section with fewer than two "- **Title**: sentence" items');
  }
  if (!/^[ \t]*\{\{template_link\}\}[ \t]*$/m.test(body)) problems.push(`does not have ${TEMPLATE_LINK} alone on its own line`);
  if (!/^warmly,[ \t]*$/im.test(body)) problems.push('does not have "Warmly," alone on its own line');
  if (subject.length > 60) problems.push("has a subject over 60 characters");
  if (/^ideas for/i.test(subject.trim())) problems.push("has a generic subject");
  return problems;
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
You write a short first cold email from a designer at FlowMint, a small studio that builds and redesigns websites for therapy and psychology practices. This time the practice's website could not be reviewed, so the email cannot mention anything specific about the site's content or design.

${
  reason === "down"
    ? `When we tried to open their website it did not load for us (${detail}). In one plain, kind sentence, say that when you tried to open their site this week it didn't load for you. Speak only for yourself, say it may be temporary, and never claim it is broken for everyone. In one more sentence say why it matters: someone looking for support may give up before they find the practice.`
    : `Do not mention any problem with their website, and do not say you could not open it. Instead, in one sentence, say what FlowMint does for practices like theirs: calm, clear homepages that make it easy to book. Make no claim about their current site.`
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
        ? "A concept page exists. Put the link marker in paragraph 3."
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
