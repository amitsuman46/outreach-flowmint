import type { ProspectStatus } from "./schemas";

export const STATUS_LABEL: Record<ProspectStatus, string> = {
  imported: "Imported",
  fit: "Fit",
  rejected: "Rejected",
  audited: "Reviewed",
  drafted: "Draft ready",
  sent: "Sent",
  replied: "Replied",
};

export const AREA_LABEL = {
  seo: "SEO",
  color: "Color",
  ux: "UX",
} as const;
