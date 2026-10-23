import { readFile } from "node:fs/promises";
import type { Audit, OutreachMessage, Prospect, Proposal } from "@prisma/client";
import type { DeskCounts } from "./counts";
import { ensureOptOut } from "./opt-out";
import { parseFindings } from "./pipeline";
import { prisma } from "./prisma";
import { toProposalView } from "./proposal";
import type { ProspectDetail, ProspectListItem, ProspectStatus } from "./schemas";
import { screenshotFile } from "./audit";

export function asStatus(status: string): ProspectStatus {
  if (
    status === "imported" ||
    status === "fit" ||
    status === "rejected" ||
    status === "audited" ||
    status === "drafted" ||
    status === "sent" ||
    status === "replied"
  ) {
    return status;
  }
  return "imported";
}

export function locationOf(prospect: {
  city: string | null;
  state: string | null;
  country: string | null;
}): string {
  return [prospect.city, prospect.state, prospect.country].filter(Boolean).join(", ");
}

export function toListItem(prospect: Prospect): ProspectListItem {
  return {
    id: prospect.id,
    name: prospect.name,
    title: prospect.title,
    company: prospect.company,
    email: prospect.email,
    emailStatus: prospect.emailStatus,
    website: prospect.website,
    industry: prospect.industry,
    country: prospect.country,
    status: asStatus(prospect.status),
    rejectReason: prospect.rejectReason,
    qualifyContact: prospect.qualifyContact,
    lastError: prospect.lastError,
    updatedAt: prospect.updatedAt.toISOString(),
  };
}

export function toDetail(
  prospect: Prospect & {
    audit: Audit | null;
    proposal: Proposal | null;
    messages: OutreachMessage[];
  },
): ProspectDetail {
  const draft =
    prospect.messages.find((message) => message.status === "draft") ??
    prospect.messages[0] ??
    null;
  return {
    ...toListItem(prospect),
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    employees: prospect.employees,
    city: prospect.city,
    state: prospect.state,
    linkedin: prospect.linkedin,
    technologies: prospect.technologies,
    keywords: prospect.keywords,
    seniority: prospect.seniority,
    departments: prospect.departments,
    annualRevenue: prospect.annualRevenue,
    apolloContactId: prospect.apolloContactId,
    location: locationOf(prospect),
    audit: prospect.audit
      ? {
          pageUrl: prospect.audit.pageUrl,
          hasScreenshot: Boolean(prospect.audit.screenshotPath),
          pageText: prospect.audit.pageText,
          findings: parseFindings(prospect.audit.findings),
        }
      : null,
    draft: draft
      ? {
          id: draft.id,
          subject: draft.subject,
          body: draft.body,
          status: draft.status,
          messageId: draft.messageId,
          sentAt: draft.sentAt?.toISOString() ?? null,
          error: draft.error,
          sentCopyError: draft.sentCopyError,
          updatedAt: draft.updatedAt.toISOString(),
        }
      : null,
    proposal: prospect.proposal ? toProposalView(prospect.proposal) : null,
  };
}

export async function readScreenshot(prospectId: string): Promise<Buffer | null> {
  try {
    return await readFile(screenshotFile(prospectId));
  } catch {
    return null;
  }
}

const ACTIVE = ["imported", "fit", "audited", "drafted"];

export async function deskCounts(): Promise<DeskCounts> {
  const [grouped, sent, replies] = await Promise.all([
    prisma.prospect.groupBy({ by: ["status"], _count: true }),
    // Everything in the Hostinger Sent folder, including mail sent from webmail.
    prisma.inboxMessage.count({ where: { direction: "out" } }),
    prisma.inboxMessage.count({ where: { direction: "in" } }),
  ]);
  const byStatus = new Map(grouped.map((row) => [row.status, row._count]));
  const gathered = ACTIVE.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0);
  return {
    gathered,
    rejected: byStatus.get("rejected") ?? 0,
    drafted: byStatus.get("drafted") ?? 0,
    contacted: (byStatus.get("sent") ?? 0) + (byStatus.get("replied") ?? 0),
    sent,
    replies,
    total: grouped.reduce((sum, row) => sum + row._count, 0),
  };
}

export { ensureOptOut };
