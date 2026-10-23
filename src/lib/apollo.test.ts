import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseApolloSheet } from "./apollo";
import { ensureOptOut, OPT_OUT_LINE } from "./opt-out";
import { applyImportStatus } from "./status";

function sheet(rows: Record<string, string>[]): Buffer {
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(book, ws, "Contacts");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const base = {
  "First Name": "Ava",
  "Last Name": "Shah",
  Title: "Founder",
  "Company Name": "Northwind Goods",
  Email: "ava@northwind.example",
  "Email Status": "Verified",
  Website: "northwind.example",
  "Apollo Contact Id": "apollo-1",
  "# Employees": "11-50",
  Industry: "Retail",
  "Qualify Contact": "",
  "Email Bounced": "false",
};

test("keeps a verified Apollo row and normalises the website", () => {
  const [row] = parseApolloSheet(sheet([base]));
  assert.equal(row.rejectReason, null);
  assert.equal(row.email, "ava@northwind.example");
  assert.equal(row.website, "https://northwind.example/");
  assert.equal(row.employees, "11-50");
  assert.equal(row.apolloContactId, "apollo-1");
  assert.equal(row.name, "Ava Shah");
});

test("rejects missing email, missing website, bounce, unverified, and qualify no", () => {
  const rows = parseApolloSheet(
    sheet([
      { ...base, Email: "", "Apollo Contact Id": "a" },
      { ...base, Website: "", "Apollo Contact Id": "b" },
      { ...base, "Email Bounced": "Yes", "Apollo Contact Id": "c" },
      { ...base, "Email Status": "Extrapolated", "Apollo Contact Id": "d" },
      { ...base, "Qualify Contact": "No", "Apollo Contact Id": "e" },
    ]),
  );
  assert.deepEqual(
    rows.map((row) => row.rejectReason),
    [
      "Missing email",
      "Missing website",
      "Email bounced",
      "Email not verified (Extrapolated)",
      "Qualify Contact is no",
    ],
  );
});

test("reads headers with different casing", () => {
  const [row] = parseApolloSheet(
    sheet([
      {
        "first name": "Sam",
        "LAST NAME": "Lee",
        email: "sam@lee.example",
        "email status": "Verified",
        website: "https://lee.example",
        "apollo contact id": "z",
      },
    ]),
  );
  assert.equal(row.name, "Sam Lee");
  assert.equal(row.rejectReason, null);
});

test("re-upload does not rewind sent mail and reopens a cheap reject", () => {
  assert.equal(
    applyImportStatus({ status: "sent", rejectReason: null }, "Email bounced")
      .status,
    "sent",
  );
  assert.deepEqual(
    applyImportStatus(
      { status: "rejected", rejectReason: "Missing website" },
      null,
    ),
    { status: "imported", rejectReason: null },
  );
  assert.equal(
    applyImportStatus(
      { status: "rejected", rejectReason: "Already has an in-house product team" },
      null,
    ).status,
    "rejected",
  );
});

test("opt-out line is added once", () => {
  const once = ensureOptOut("Hello from FlowMint.");
  assert.match(once, new RegExp(OPT_OUT_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(ensureOptOut(once), once);
});
