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
