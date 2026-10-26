/**
 * Builds the text and HTML versions of an outgoing email.
 * Pure functions only, so the review screen can render the same preview the recipient gets.
 */

export interface Signature {
  name: string;
  title: string;
  company: string;
  website: string;
  email: string;
  phone: string;
  logoUrl: string;
}

export interface EmailParts {
  body: string;
  signature: Signature;
  company?: string;
  demoUrl?: string | null;
  pdfUrl?: string | null;
  pdfAttached?: boolean;
}

/** Every word starts with a capital letter. Existing capitals (NDIS, MyLife) are kept. */
export function titleCase(subject: string): string {
  return subject
    .split(/(\s+)/)
    .map((part) => part.replace(/^([("'“‘\[]*)(\p{Ll})/u, (_, lead: string, letter: string) => lead + letter.toUpperCase()))
    .join("");
}

/** Drafts put this on its own line where the concept link belongs. */
export const CONCEPT_LINK = "{{concept_link}}";

// Matches only the opt-out sentence. Drafts are often one paragraph, so a whole-line match would take the message.
const OPT_OUT_PATTERN = /[^.!?\n]*reply "stop"[^.!?\n]*[.!?]?/i;
const LINK_LINE = /^[ \t]*(?:👉[ \t]*)?\{\{concept_link\}\}[ \t]*$/m;

export function splitOptOut(body: string): { main: string; optOut: string } {
  const match = body.match(OPT_OUT_PATTERN);
  if (!match) return { main: body.trim(), optOut: "" };
  return {
    main: body.replace(match[0], "").replace(/[ \t]+\n/g, "\n").trim(),
    optOut: match[0].trim(),
  };
}

export function hasConceptLink(body: string): boolean {
  return LINK_LINE.test(body) || body.includes(CONCEPT_LINK);
}

function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** The sentence about the deck that goes right under the link. */
function deckLine(parts: EmailParts): string {
  if (parts.pdfAttached) return "The attached deck walks through the details.";
  if (parts.pdfUrl) return `A short deck with the details: ${parts.pdfUrl}`;
  return "";
}

/** Swaps the link marker for the real link, or removes its line when no link is sent. */
function placeLink(main: string, parts: EmailParts, link: (url: string) => string): string {
  if (!hasConceptLink(main)) return main;
  if (!parts.demoUrl) {
    return main.replace(LINK_LINE, "").replace(CONCEPT_LINK, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  const replacement = link(parts.demoUrl);
  return LINK_LINE.test(main) ? main.replace(LINK_LINE, replacement) : main.replace(CONCEPT_LINK, replacement);
}

export function renderEmailText(parts: EmailParts): string {
  const { main, optOut } = splitOptOut(parts.body);
  const inline = hasConceptLink(main);
  const deck = deckLine(parts);
  const blocks = [
    placeLink(main, parts, (url) => `👉 ${url}${deck && parts.demoUrl ? `\n${deck}` : ""}`),
  ];
  if (!inline && parts.demoUrl) {
    blocks.push([`Homepage concept${parts.company ? ` for ${parts.company}` : ""}: ${parts.demoUrl}`, deck].filter(Boolean).join("\n"));
  } else if (!parts.demoUrl && parts.pdfAttached) {
    blocks.push("The attached deck walks through the details.");
  }
  const sig = parts.signature;
  const sigLines = [
    sig.name,
    [sig.title, sig.company].filter(Boolean).join(", ") || sig.company,
    [sig.website && websiteLabel(sig.website), sig.phone].filter(Boolean).join(" · "),
  ].filter(Boolean);
  let text = blocks.join("\n\n");
  // A sign-off like "Warmly," sits directly above the name.
  if (sigLines.length) text += `${/,\s*$/.test(text) ? "\n" : "\n\n"}${sigLines.join("\n")}`;
  if (optOut) text += `\n\n${optOut}`;
  return text;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LINK_STYLE = "color:#1a6b63;text-decoration:underline;";

function paragraphs(text: string, parts: EmailParts): string {
  const deck = deckLine(parts);
  const marker = "\u0000LINK\u0000";
  const withMarker = placeLink(text, parts, () => marker);
  return withMarker
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      let html = escapeHtml(block).replace(/\n/g, "<br>");
      if (html.includes(marker) && parts.demoUrl) {
        const deckHtml = parts.pdfAttached
          ? `<br><span style="color:#57606a;font-size:14px;">${escapeHtml(deck)}</span>`
          : parts.pdfUrl
            ? `<br><span style="font-size:14px;"><a href="${escapeHtml(parts.pdfUrl)}" style="${LINK_STYLE}">A short deck with the details (PDF)</a></span>`
            : "";
        html = html.replace(
          marker,
          `👉 <a href="${escapeHtml(parts.demoUrl)}" style="${LINK_STYLE}font-weight:600;">${escapeHtml(websiteLabel(parts.demoUrl))}</a>${deckHtml}`,
        );
      }
      return `<p style="margin:0 0 14px;">${html}</p>`;
    })
    .join("");
}

export function renderEmailHtml(parts: EmailParts): string {
  const { main, optOut } = splitOptOut(parts.body);
  const sig = parts.signature;
  const inline = hasConceptLink(main);

  let demo = "";
  if (!inline && parts.demoUrl) {
    const pdfLine = parts.pdfAttached
      ? `<div style="margin-top:6px;color:#57606a;font-size:13px;">The attached deck walks through the details.</div>`
      : parts.pdfUrl
        ? `<div style="margin-top:6px;font-size:13px;"><a href="${escapeHtml(parts.pdfUrl)}" style="${LINK_STYLE}">A short deck with the details (PDF)</a></div>`
        : "";
    demo = `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border-collapse:separate;">
  <tr><td style="border-left:3px solid #2bb3a3;padding:4px 0 4px 12px;">
    <div style="font-size:14px;"><a href="${escapeHtml(parts.demoUrl)}" style="${LINK_STYLE}font-weight:600;">View the homepage concept${parts.company ? ` for ${escapeHtml(parts.company)}` : ""}</a></div>
    ${pdfLine}
  </td></tr>
</table>`;
  } else if (!parts.demoUrl && parts.pdfAttached) {
    demo = `<p style="margin:0 0 14px;color:#57606a;">The attached deck walks through the details.</p>`;
  }

  const contact = [
    sig.website
      ? `<a href="${escapeHtml(sig.website)}" style="${LINK_STYLE}">${escapeHtml(websiteLabel(sig.website))}</a>`
      : "",
    sig.phone ? escapeHtml(sig.phone) : "",
  ]
    .filter(Boolean)
    .join(' <span style="color:#c4c9cf;">·</span> ');

  const logo = sig.logoUrl
    ? `<td style="padding-right:10px;vertical-align:top;"><img src="${escapeHtml(sig.logoUrl)}" width="28" height="28" alt="${escapeHtml(sig.company)}" style="display:block;border:0;"></td>`
    : "";

  const signature = `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px;">
  <tr>
    ${logo}
    <td style="vertical-align:top;font-size:14px;line-height:1.45;color:#3d4650;">
      ${sig.name ? `<div style="font-weight:600;color:#070d13;">${escapeHtml(sig.name)}</div>` : ""}
      <div>${escapeHtml([sig.title, sig.company].filter(Boolean).join(", ") || sig.company)}${contact ? ` · ${contact}` : ""}</div>
    </td>
  </tr>
</table>`;

  const footer = optOut
    ? `<p style="margin:18px 0 0;font-size:12px;color:#8a929b;">${escapeHtml(optOut)}</p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2328;max-width:600px;">
${paragraphs(main, parts)}
${demo}
${signature}
${footer}
</div>
</body></html>`;
}

/* ---------- "Without PPT": the proposal is written into a decorative email ---------- */

/** Drafts put this on its own line where the template site button goes. */
export const TEMPLATE_LINK = "{{template_link}}";

export interface ProposalEmailParts {
  body: string;
  signature: Signature;
  company: string;
  templateUrl: string | null;
}

type Token =
  | { type: "para"; text: string }
  | { type: "heading"; text: string }
  | { type: "items"; items: { title: string; text: string }[] }
  | { type: "link" };

/**
 * Reads the light markup drafts use: "## Heading", "- **Title**: detail" items,
 * the {{template_link}} line, and plain paragraphs separated by blank lines.
 */
export function parseProposalBody(body: string): Token[] {
  const tokens: Token[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) tokens.push({ type: "para", text: para.join("\n") });
    para = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.includes(TEMPLATE_LINK)) {
      flush();
      tokens.push({ type: "link" });
      continue;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flush();
      tokens.push({ type: "heading", text: heading[1].trim() });
      continue;
    }
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (item) {
      flush();
      const content = item[1];
      const titled = content.match(/^\*\*(.+?)\*\*\s*[:.\-–]?\s*(.*)$/) ?? content.match(/^([^:]{3,70}):\s+(.+)$/);
      const entry = titled ? { title: titled[1].trim(), text: titled[2].trim() } : { title: "", text: content.trim() };
      const last = tokens[tokens.length - 1];
      if (last?.type === "items") last.items.push(entry);
      else tokens.push({ type: "items", items: [entry] });
      continue;
    }
    para.push(line.replace(/\*\*(.+?)\*\*/g, "$1"));
  }
  flush();
  return tokens;
}

export function renderProposalEmailText(parts: ProposalEmailParts): string {
  const { main, optOut } = splitOptOut(parts.body);
  const out: string[] = [];
  for (const token of parseProposalBody(main)) {
    if (token.type === "para") out.push(token.text);
    if (token.type === "heading") out.push(token.text.toUpperCase());
    if (token.type === "items") {
      out.push(token.items.map((item, i) => `${i + 1}. ${item.title ? `${item.title}: ` : ""}${item.text}`).join("\n"));
    }
    if (token.type === "link" && parts.templateUrl) out.push(`👉 See the website template: ${parts.templateUrl}`);
  }
  let text = out.join("\n\n");
  const sig = parts.signature;
  const sigLines = [
    sig.name,
    [sig.title, sig.company].filter(Boolean).join(", ") || sig.company,
    [sig.website && websiteLabel(sig.website), sig.phone].filter(Boolean).join(" · "),
  ].filter(Boolean);
  if (sigLines.length) text += `${/,\s*$/.test(text) ? "\n" : "\n\n"}${sigLines.join("\n")}`;
  if (optOut) text += `\n\n${optOut}`;
  return text;
}

// One tone per section, in order: what I noticed, what I'd change, what it should do.
const SECTION_TONES = [
  { accent: "#c2410c", soft: "#fff4ed", label: "#9a3412" },
  { accent: "#1a6b63", soft: "#ecf8f5", label: "#15524c" },
  { accent: "#4f46e5", soft: "#f0f0ff", label: "#3730a3" },
];

export function renderProposalEmailHtml(parts: ProposalEmailParts): string {
  const { main, optOut } = splitOptOut(parts.body);
  const sig = parts.signature;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";
  let section = -1;
  const rows: string[] = [];

  for (const token of parseProposalBody(main)) {
    if (token.type === "para") {
      rows.push(
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#24312f;">${escapeHtml(token.text).replace(/\n/g, "<br>")}</p>`,
      );
    }
    if (token.type === "heading") {
      section += 1;
      const tone = SECTION_TONES[Math.min(section, SECTION_TONES.length - 1)];
      rows.push(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 12px;">
  <tr>
    <td width="4" style="background:${tone.accent};border-radius:4px;">&nbsp;</td>
    <td style="padding-left:12px;font-family:${serif};font-size:20px;line-height:1.3;color:#0f1f1d;font-weight:bold;">${escapeHtml(token.text)}</td>
  </tr>
</table>`);
    }
    if (token.type === "items") {
      const tone = SECTION_TONES[Math.max(0, Math.min(section, SECTION_TONES.length - 1))];
      rows.push(
        token.items
          .map(
            (item, i) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;background:${tone.soft};border-radius:12px;">
  <tr>
    <td width="30" valign="top" style="padding:14px 0 14px 14px;">
      <div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:#ffffff;color:${tone.label};font-family:${font};font-size:13px;font-weight:bold;text-align:center;">${i + 1}</div>
    </td>
    <td valign="top" style="padding:14px 16px 14px 12px;font-family:${font};">
      ${item.title ? `<div style="font-size:15px;font-weight:bold;color:#0f1f1d;margin-bottom:3px;">${escapeHtml(item.title)}</div>` : ""}
      <div style="font-size:14px;line-height:1.55;color:#46524f;">${escapeHtml(item.text)}</div>
    </td>
  </tr>
</table>`,
          )
          .join(""),
      );
    }
    if (token.type === "link" && parts.templateUrl) {
      rows.push(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 22px;">
  <tr><td align="center" style="background:#0b3b36;border-radius:14px;padding:24px 20px;">
    <div style="font-family:${font};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8be8db;margin-bottom:8px;">See it in action</div>
    <div style="font-family:${serif};font-size:19px;color:#ffffff;margin-bottom:16px;">A website built the way we'd build yours</div>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#2bb3a3;border-radius:999px;">
        <a href="${escapeHtml(parts.templateUrl)}" style="display:inline-block;padding:12px 26px;font-family:${font};font-size:15px;font-weight:bold;color:#04201c;text-decoration:none;">View the website template &rarr;</a>
      </td>
    </tr></table>
    <div style="font-family:${font};font-size:12px;color:#9fc7c1;margin-top:12px;">${escapeHtml(websiteLabel(parts.templateUrl))}</div>
  </td></tr>
</table>`);
    }
  }

  const contact = [
    sig.website ? `<a href="${escapeHtml(sig.website)}" style="color:#1a6b63;text-decoration:none;">${escapeHtml(websiteLabel(sig.website))}</a>` : "",
    sig.phone ? escapeHtml(sig.phone) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const logo = sig.logoUrl
    ? `<td width="40" valign="top"><img src="${escapeHtml(sig.logoUrl)}" width="32" height="32" alt="${escapeHtml(sig.company)}" style="display:block;border:0;"></td>`
    : "";

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @media (max-width: 520px) {
    .fm-outer { padding: 12px 6px !important; }
    .fm-pad { padding-left: 18px !important; padding-right: 18px !important; }
  }
</style>
</head><body style="margin:0;padding:0;background:#f2f5f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f4;">
  <tr><td align="center" class="fm-outer" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;border:1px solid #e3e9e7;overflow:hidden;">
      <tr><td class="fm-pad" style="background:#0b3b36;padding:26px 32px;">
        <div style="font-family:${font};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8be8db;">Website ideas for</div>
        <div style="font-family:${serif};font-size:24px;line-height:1.25;color:#ffffff;margin-top:6px;">${escapeHtml(parts.company)}</div>
      </td></tr>
      <tr><td class="fm-pad" style="padding:30px 32px 8px;font-family:${font};">
        ${rows.join("\n")}
      </td></tr>
      <tr><td class="fm-pad" style="padding:0 32px 26px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6ebe9;padding-top:14px;width:100%;">
          <tr>${logo}
            <td valign="top" style="font-family:${font};font-size:13px;line-height:1.5;color:#46524f;">
              ${sig.name ? `<div style="font-size:14px;font-weight:bold;color:#0f1f1d;">${escapeHtml(sig.name)}</div>` : ""}
              <div>${escapeHtml([sig.title, sig.company].filter(Boolean).join(", ") || sig.company)}${contact ? ` · ${contact}` : ""}</div>
            </td>
          </tr>
        </table>
      </td></tr>
      ${optOut ? `<tr><td class="fm-pad" style="background:#f7f9f8;padding:14px 32px;font-family:${font};font-size:12px;color:#8a9694;">${escapeHtml(optOut)}</td></tr>` : ""}
    </table>
  </td></tr>
</table>
</body></html>`;
}
