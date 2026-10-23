import * as XLSX from "xlsx";

export interface ParsedProspect {
  apolloContactId: string | null;
  firstName: string;
  lastName: string;
  name: string;
  title: string | null;
  company: string;
  email: string | null;
  emailStatus: string | null;
  website: string | null;
  industry: string | null;
  employees: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin: string | null;
  technologies: string | null;
  keywords: string | null;
  seniority: string | null;
  departments: string | null;
  qualifyContact: string | null;
  annualRevenue: string | null;
  raw: Record<string, string>;
  rejectReason: string | null;
}

const NO_QUALIFY = new Set([
  "no",
  "n",
  "false",
  "reject",
  "rejected",
  "unqualified",
  "do not contact",
]);

function cell(row: Record<string, unknown>, header: string): string {
  const target = header.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.trim().toLowerCase() === target) {
      if (value == null) return "";
      return String(value).trim();
    }
  }
  return "";
}

function blank(value: string): string | null {
  return value ? value : null;
}

function cleanEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProto);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function truthy(value: string): boolean {
  return ["true", "yes", "y", "1"].includes(value.trim().toLowerCase());
}

export function cheapReject(input: {
  email: string | null;
  website: string | null;
  emailStatus: string | null;
  emailBounced: string;
  qualifyContact: string | null;
}): string | null {
  if (!input.email) return "Missing email";
  if (!input.website) return "Missing website";
  if (truthy(input.emailBounced)) return "Email bounced";
  if ((input.emailStatus ?? "").toLowerCase() !== "verified") {
    const label = input.emailStatus || "missing";
    return `Email not verified (${label})`;
  }
  const qualify = (input.qualifyContact ?? "").trim().toLowerCase();
  if (NO_QUALIFY.has(qualify)) return "Qualify Contact is no";
  return null;
}

function stringifyRow(row: Record<string, unknown>): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    raw[key] = value == null ? "" : String(value);
  }
  return raw;
}

export function parseApolloRow(row: Record<string, unknown>): ParsedProspect | null {
  const raw = stringifyRow(row);
  const hasAny = Object.values(raw).some((value) => value.trim());
  if (!hasAny) return null;

  const firstName = cell(row, "First Name");
  const lastName = cell(row, "Last Name");
  const company =
    cell(row, "Company Name") ||
    cell(row, "Company Name for Emails") ||
    "Unknown company";
  const name = `${firstName} ${lastName}`.trim() || company;
  const email = cleanEmail(cell(row, "Email"));
  const emailStatus = blank(cell(row, "Email Status"));
  const website = normalizeWebsite(cell(row, "Website"));
  const qualifyContact = blank(cell(row, "Qualify Contact"));
  const apolloContactId = blank(cell(row, "Apollo Contact Id"));

  if (!apolloContactId && !email && name === "Unknown company") return null;

  return {
    apolloContactId,
    firstName,
    lastName,
    name,
    title: blank(cell(row, "Title")),
    company,
    email,
    emailStatus,
    website,
    industry: blank(cell(row, "Industry")),
    employees: blank(cell(row, "# Employees")),
    city: blank(cell(row, "Company City") || cell(row, "City")),
    state: blank(cell(row, "Company State") || cell(row, "State")),
    country: blank(cell(row, "Company Country") || cell(row, "Country")),
    linkedin: blank(cell(row, "Person Linkedin Url")),
    technologies: blank(cell(row, "Technologies")),
    keywords: blank(cell(row, "Keywords")),
    seniority: blank(cell(row, "Seniority")),
    departments: blank(cell(row, "Departments")),
    qualifyContact,
    annualRevenue: blank(cell(row, "Annual Revenue")),
    raw,
    rejectReason: cheapReject({
      email,
      website,
      emailStatus,
      emailBounced: cell(row, "Email Bounced"),
      qualifyContact,
    }),
  };
}

export function parseApolloSheet(buffer: Buffer): ParsedProspect[] {
  const book = XLSX.read(buffer, { type: "buffer" });
  const sheetName = book.SheetNames[0];
  if (!sheetName) return [];
  const sheet = book.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const parsed: ParsedProspect[] = [];
  for (const row of rows) {
    const prospect = parseApolloRow(row);
    if (prospect) parsed.push(prospect);
  }
  return parsed;
}
