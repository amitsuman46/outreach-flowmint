import { z } from "zod";
import type { SiteFacts } from "./site-facts";

export const prospectStatusSchema = z.enum([
  "imported",
  "fit",
  "rejected",
  "audited",
  "drafted",
  "sent",
  "replied",
]);

export type ProspectStatus = z.infer<typeof prospectStatusSchema>;

export const findingSchema = z.object({
  area: z.enum(["seo", "color", "ux"]),
  observation: z.string(),
  suggestion: z.string(),
});

export type Finding = z.infer<typeof findingSchema>;

export const findingsSchema = z.array(findingSchema);

export const updateDraftSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(8000),
});

export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface ProspectListItem {
  id: string;
  mode: LeadMode;
  name: string;
  title: string | null;
  company: string;
  email: string | null;
  emailStatus: string | null;
  website: string | null;
  industry: string | null;
  country: string | null;
  status: ProspectStatus;
  rejectReason: string | null;
  qualifyContact: string | null;
  lastError: string | null;
  /** When the lead was first uploaded. */
  createdAt: string;
  updatedAt: string;
  /** A concept page exists for this lead (With PPT). */
  hasConcept?: boolean;
}

export interface DraftView {
  id: string;
  subject: string;
  body: string;
  status: string;
  messageId: string | null;
  sentAt: string | null;
  error: string | null;
  sentCopyError: string | null;
  updatedAt: string;
}

export interface AuditView {
  pageUrl: string;
  reachable: boolean;
  /** "blocked", or "down: <what happened>" when the site could not be opened. */
  unreachableReason: string | null;
  hasScreenshot: boolean;
  pageText: string | null;
  findings: Finding[];
}

export interface ProspectDetail extends ProspectListItem {
  firstName: string;
  lastName: string;
  employees: string | null;
  city: string | null;
  state: string | null;
  linkedin: string | null;
  technologies: string | null;
  keywords: string | null;
  seniority: string | null;
  departments: string | null;
  annualRevenue: string | null;
  apolloContactId: string | null;
  location: string;
  audit: AuditView | null;
  draft: DraftView | null;
  proposal: ProposalView | null;
}

export interface InboxItem {
  id: string;
  prospectId: string | null;
  prospectName: string | null;
  company: string | null;
  direction: "in" | "out";
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
}

export interface RunView {
  id: string;
  kind: "prepare" | "refresh";
  mode: LeadMode;
  status: "running" | "done" | "error";
  total: number;
  done: number;
  step: string | null;
  error: string | null;
}

const titledSchema = z.object({ title: z.string(), text: z.string() });

export const proposalContentSchema = z.object({
  summary: z.string().default(""),
  drawbacks: z
    .array(
      z.object({
        area: z.string(),
        title: z.string(),
        detail: z.string(),
        impact: z.string(),
      }),
    )
    .default([]),
  improvements: z
    .array(z.object({ title: z.string(), detail: z.string(), fixes: z.string() }))
    .default([]),
  results: z.array(titledSchema).default([]),
});

export type ProposalContent = z.infer<typeof proposalContentSchema>;

/** One practice entry in the template's PRACTICES object (js/practices.js). */
export const practiceContentSchema = z.object({
  name: z.string(),
  eyebrow: z.string(),
  heroSub: z.string(),
  firstName: z.string(),
  initials: z.string(),
  aboutTitle: z.string().optional(),
  aboutLead: z.string(),
  aboutBody: z.string().optional(),
  location: z.string(),
  phone: z.string(),
  email: z.string(),
  hours: z.string(),
  chips: z.array(z.string()),
  funding: z.array(z.string()),
  feeNote: z.string().optional(),
  help: z.array(z.string()),
  assessments: z.boolean(),
  footerTag: z.string(),
});

export type PracticeContent = z.infer<typeof practiceContentSchema>;

export interface Brand {
  primary: string;
  logo: string | null;
  bookingUrl: string | null;
  facts?: SiteFacts | null;
}

export interface ProposalView {
  /** The ?for= key on the concept site. */
  slug: string;
  /** Fields still showing a [placeholder] on the concept page, such as "phone". */
  placeholders: string[];
  demoUrl: string;
  pdfUrl: string;
  hasPdf: boolean;
  builtAt: string;
  deployedAt: string | null;
  deployError: string | null;
  needsDeploy: boolean;
  content: ProposalContent;
}

/** ppt: concept site + PDF proposal. template: one shared template site, proposal written into the email. */
export type LeadMode = "ppt" | "template";

export function asMode(value: unknown): LeadMode {
  return value === "template" ? "template" : "ppt";
}
