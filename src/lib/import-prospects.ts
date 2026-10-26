import type { ParsedProspect } from "./apollo";
import { prisma } from "./prisma";
import type { LeadMode, ProspectStatus } from "./schemas";
import { applyImportStatus } from "./status";

export interface ImportResult {
  created: number;
  updated: number;
  rejected: number;
  skipped: number;
  /** Already being worked on in the other workflow, so left there. */
  otherList: number;
}

interface ExistingRow {
  id: string;
  mode: string;
  email: string | null;
  apolloContactId: string | null;
  status: string;
  rejectReason: string | null;
}

function asStatus(status: string): ProspectStatus {
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

export async function importProspects(
  rows: ParsedProspect[],
  mode: LeadMode = "ppt",
): Promise<ImportResult> {
  const existing = await prisma.prospect.findMany({
    select: {
      id: true,
      mode: true,
      email: true,
      apolloContactId: true,
      status: true,
      rejectReason: true,
    },
  });
  const byApollo = new Map<string, ExistingRow>();
  const byEmail = new Map<string, ExistingRow>();
  for (const row of existing) {
    if (row.apolloContactId) byApollo.set(row.apolloContactId, row);
    if (row.email) byEmail.set(row.email, row);
  }

  const contacted = await contactedAddresses();

  const result: ImportResult = {
    created: 0,
    updated: 0,
    rejected: 0,
    skipped: 0,
    otherList: 0,
  };

  for (const row of rows) {
    if (!row.apolloContactId && !row.email) {
      result.skipped += 1;
      continue;
    }

    const match =
      (row.apolloContactId ? byApollo.get(row.apolloContactId) : undefined) ??
      (row.email ? byEmail.get(row.email) : undefined);

    let next = applyImportStatus(
      {
        status: asStatus(match?.status ?? "imported"),
        rejectReason: match?.rejectReason ?? null,
      },
      row.rejectReason,
    );
    // Someone already in the mailbox history must not be prepared and emailed a second time.
    const history = row.email ? contacted.get(row.email.toLowerCase()) : undefined;
    if (history && next.status !== "sent" && next.status !== "replied") {
      next = { status: history, rejectReason: null };
    }

    // A lead nobody has worked on yet moves to the list it was just uploaded to.
    // One that is already reviewed, drafted or sent stays in its own workflow.
    const untouched = !match || match.status === "imported" || match.status === "rejected";
    const leadMode = untouched ? mode : (match.mode as LeadMode);
    if (match && !untouched && match.mode !== mode) result.otherList += 1;

    const data = {
      mode: leadMode,
      apolloContactId: row.apolloContactId,
      firstName: row.firstName,
      lastName: row.lastName,
      name: row.name,
      title: row.title,
      company: row.company,
      email: row.email,
      emailStatus: row.emailStatus,
      website: row.website,
      industry: row.industry,
      employees: row.employees,
      city: row.city,
      state: row.state,
      country: row.country,
      linkedin: row.linkedin,
      technologies: row.technologies,
      keywords: row.keywords,
      seniority: row.seniority,
      departments: row.departments,
      qualifyContact: row.qualifyContact,
      annualRevenue: row.annualRevenue,
      raw: JSON.stringify(row.raw),
      status: next.status,
      rejectReason: next.rejectReason,
      lastError: next.status === "imported" ? null : undefined,
    };

    try {
      if (!match) {
        const created = await prisma.prospect.create({
          data: { ...data, lastError: null },
          select: { id: true, mode: true, email: true, apolloContactId: true, status: true, rejectReason: true },
        });
        if (history && created.email) await linkMailHistory(created.id, created.email);
        if (created.apolloContactId) byApollo.set(created.apolloContactId, created);
        if (created.email) byEmail.set(created.email, created);
        result.created += 1;
      } else {
        const emailTaken =
          row.email &&
          byEmail.get(row.email) &&
          byEmail.get(row.email)?.id !== match.id;
        const updated = await prisma.prospect.update({
          where: { id: match.id },
          data: {
            ...data,
            email: emailTaken ? undefined : data.email,
            apolloContactId: data.apolloContactId ?? undefined,
            lastError: next.status === "imported" ? null : undefined,
          },
          select: { id: true, mode: true, email: true, apolloContactId: true, status: true, rejectReason: true },
        });
        if (match.apolloContactId && match.apolloContactId !== updated.apolloContactId) {
          byApollo.delete(match.apolloContactId);
        }
        if (match.email && match.email !== updated.email) {
          byEmail.delete(match.email);
        }
        if (updated.apolloContactId) byApollo.set(updated.apolloContactId, updated);
        if (updated.email) byEmail.set(updated.email, updated);
        result.updated += 1;
      }
      if (next.status === "rejected") result.rejected += 1;
    } catch {
      result.skipped += 1;
    }
  }

  return result;
}

/** Addresses in the stored mailbox history: "replied" if they wrote back, otherwise "sent". */
async function contactedAddresses(): Promise<Map<string, "sent" | "replied">> {
  const messages = await prisma.inboxMessage.findMany({
    select: { direction: true, from: true, to: true },
  });
  const map = new Map<string, "sent" | "replied">();
  const addresses = (value: string) =>
    (value.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? []).map((address) => address.toLowerCase());
  for (const message of messages) {
    if (message.direction === "out") {
      for (const address of addresses(message.to)) {
        if (!map.has(address)) map.set(address, "sent");
      }
    }
  }
  for (const message of messages) {
    if (message.direction !== "in") continue;
    for (const address of addresses(message.from)) {
      if (map.has(address)) map.set(address, "replied");
    }
  }
  return map;
}

async function linkMailHistory(prospectId: string, email: string): Promise<void> {
  await prisma.inboxMessage.updateMany({
    where: {
      prospectId: null,
      OR: [{ from: { contains: email } }, { to: { contains: email } }],
    },
    data: { prospectId },
  });
}
