/** Shared bits for the PDF deck. The concept site itself is the hand-built template on Netlify. */

export const FLOWMINT_MARK = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="5" y="8" width="20" height="6.5" rx="3.25" fill="#1A6B63"/><rect x="5" y="16.75" width="24" height="6.5" rx="3.25" fill="#2BB3A3"/><rect x="5" y="25.5" width="20" height="6.5" rx="3.25" fill="#1A6B63"/><circle cx="33.5" cy="20" r="3.1" fill="#8BE8DB"/></svg>`;

export function esc(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
