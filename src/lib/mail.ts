import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import {
  safeName,
  storeOutgoing,
  storeParsedFiles,
  type OutgoingFile,
  type StoredAttachment,
} from "./attachments";
import { renderEmailHtml, renderEmailText } from "./email-template";
import { ensureOptOut } from "./opt-out";
import { prisma } from "./prisma";
import { demoPdfUrl, demoUrl, proposalPdfFile, signature } from "./site-config";

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
}

export function mailConfig(): MailConfig {
  const user = process.env.OUTREACH_SMTP_USER?.trim() ?? "";
  const pass = process.env.OUTREACH_SMTP_PASSWORD ?? "";
  return {
    host: process.env.OUTREACH_SMTP_HOST?.trim() || "smtp.hostinger.com",
    port: Number(process.env.OUTREACH_SMTP_PORT || 465),
    user,
    pass,
    imapHost: process.env.OUTREACH_IMAP_HOST?.trim() || "imap.hostinger.com",
    imapPort: Number(process.env.OUTREACH_IMAP_PORT || 993),
    imapUser: process.env.OUTREACH_IMAP_USER?.trim() || user,
    imapPass: process.env.OUTREACH_IMAP_PASSWORD || pass,
  };
}

export function mailReady(): boolean {
  const cfg = mailConfig();
  return Boolean(cfg.user && cfg.pass);
}

export interface SendOptions {
  /** Add the concept link and PDF link under the body. */
  includeDemo?: boolean;
  /** Attach the generated proposal PDF. */
  attachProposal?: boolean;
}

export interface SendResult {
  messageId: string;
  /** Set when the email was delivered but could not be copied into the Hostinger Sent folder. */
  warning?: string;
}

export async function sendApprovedDraft(
  id: string,
  subject: string,
  body: string,
  files: OutgoingFile[] = [],
  options: SendOptions = {},
): Promise<SendResult> {
  const prospect = await prisma.prospect.findUnique({
    where: { id },
    include: { proposal: true },
  });
  if (!prospect) throw new Error("That person is no longer on the desk");
  if (prospect.status === "sent" || prospect.status === "replied") {
    throw new Error("This email was already sent");
  }
  if (prospect.status !== "drafted") {
    throw new Error("Prepare a draft before sending");
  }
  if (!prospect.email) throw new Error("Missing email");

  const proposal = prospect.proposal;
  if (options.includeDemo) {
    if (!proposal) throw new Error("Build the proposal before including the concept link.");
    if (!proposal.deployedAt || proposal.deployedAt < proposal.builtAt) {
      throw new Error("Publish the concept site first, or untick the concept link.");
    }
  }
  const outgoing = [...files];
  if (options.attachProposal) {
    if (!proposal?.hasPdf) throw new Error("Build the proposal PDF before attaching it.");
    outgoing.unshift({
      filename: safeName(`${prospect.company} - FlowMint proposal.pdf`),
      content: await readFile(proposalPdfFile(proposal.slug)),
      contentType: "application/pdf",
    });
  }

  const cfg = mailConfig();
  const stored = ensureOptOut(body);
  const message = await prisma.outreachMessage.findFirst({
    where: { prospectId: id, status: "draft" },
    orderBy: { createdAt: "desc" },
  });
  if (!message) throw new Error("Prepare a draft before sending");

  await prisma.outreachMessage.update({
    where: { id: message.id },
    data: { subject: subject.trim(), body: stored, error: null },
  });

  const parts = {
    body: stored,
    signature: signature(),
    company: prospect.company,
    demoUrl: options.includeDemo && proposal ? demoUrl(proposal.slug) : null,
    pdfUrl: options.includeDemo && proposal?.hasPdf ? demoPdfUrl(proposal.slug) : null,
    pdfAttached: Boolean(options.attachProposal),
  };
  const text = renderEmailText(parts);

  try {
    const sent = await sendOutreachMail({
      to: prospect.email,
      subject: subject.trim(),
      text,
      html: renderEmailHtml(parts),
      files: outgoing,
    });
    const attachments = await storeOutgoing(outgoing);
    const sentAt = new Date();
    await prisma.outreachMessage.update({
      where: { id: message.id },
      data: {
        status: "sent",
        messageId: sent.messageId,
        sentAt,
        error: null,
        sentCopyError: sent.warning ?? null,
      },
    });
    await recordOutgoing({
      prospectId: id,
      from: cfg.user,
      to: prospect.email,
      subject: subject.trim(),
      text,
      attachments,
      messageId: sent.messageId,
      sentAt,
    });
    await prisma.prospect.update({
      where: { id },
      data: { status: "sent", lastError: null },
    });
    return sent;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Send failed";
    await prisma.outreachMessage.update({
      where: { id: message.id },
      data: { error: reason.slice(0, 500) },
    });
    await prisma.prospect.update({
      where: { id },
      data: { lastError: reason.slice(0, 500) },
    });
    throw new Error(reason);
  }
}

async function recordOutgoing(input: {
  prospectId?: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  attachments: StoredAttachment[];
  messageId: string;
  sentAt: Date;
}): Promise<void> {
  // The next mailbox sync sees the same Message-ID in the Sent folder and skips it.
  await prisma.inboxMessage.upsert({
    where: { messageId: input.messageId },
    create: {
      prospectId: input.prospectId,
      direction: "out",
      from: input.from,
      to: input.to,
      subject: input.subject,
      body: input.text,
      attachments: JSON.stringify(input.attachments),
      messageId: input.messageId,
      receivedAt: input.sentAt,
    },
    update: {},
  });
}

export function parseRecipients(value: string): string[] {
  const recipients = value
    .split(/[,;]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!recipients.length) throw new Error("Add at least one email address.");
  for (const email of recipients) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`${email} is not an email address.`);
    }
  }
  return recipients;
}

export async function sendCustomMail(input: {
  to: string;
  subject: string;
  body: string;
  files?: OutgoingFile[];
  withSignature?: boolean;
}): Promise<SendResult> {
  const cfg = mailConfig();
  const recipients = parseRecipients(input.to);
  const subject = input.subject.replace(/\s+/g, " ").trim();
  const body = input.body.trim();
  if (!subject) throw new Error("Add a subject.");
  if (!body) throw new Error("Write the email.");
  const files = input.files ?? [];
  const parts = { body, signature: signature() };
  const text = input.withSignature === false ? body : renderEmailText(parts);
  const sent = await sendOutreachMail({
    to: recipients.join(", "),
    subject,
    text,
    html: input.withSignature === false ? undefined : renderEmailHtml(parts),
    files,
  });
  const attachments = await storeOutgoing(files);
  const prospect = await prisma.prospect.findFirst({
    where: { email: recipients[0] },
    orderBy: { updatedAt: "desc" },
  });
  await recordOutgoing({
    prospectId: prospect?.id,
    from: cfg.user,
    to: recipients.join(", "),
    subject,
    text,
    attachments,
    messageId: sent.messageId,
    sentAt: new Date(),
  });
  return sent;
}

function senderDomain(user: string): string {
  return user.split("@")[1] || "flowmint.works";
}

export async function sendOutreachMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  files?: OutgoingFile[];
}): Promise<SendResult> {
  const cfg = mailConfig();
  if (!cfg.user || !cfg.pass) {
    throw new Error("Hostinger mailbox is not configured");
  }
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  // Set the Message-ID ourselves. With a raw message nodemailer reports a different
  // id than the one in the headers, which made the Sent-folder sync store duplicates.
  const messageId = `<${randomUUID()}@${senderDomain(cfg.user)}>`;
  const fromName = process.env.OUTREACH_FROM_NAME?.trim();
  const composed = new MailComposer({
    from: fromName ? { name: fromName, address: cfg.user } : cfg.user,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    messageId,
    headers: {
      "List-Unsubscribe": `<mailto:${cfg.user}?subject=unsubscribe>`,
    },
    attachments: (input.files ?? []).map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
    })),
  });
  const raw = await composed.compile().build();
  await transport.sendMail({
    raw,
    envelope: { from: cfg.user, to: input.to },
  });
  const warning = await appendToSent(raw);
  return warning ? { messageId, warning } : { messageId };
}

/** Copies the sent message into the Hostinger Sent folder. Returns a reason when it could not. */
async function appendToSent(raw: Buffer): Promise<string | undefined> {
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const cfg = mailConfig();
      const client = new ImapFlow({
        host: cfg.imapHost,
        port: cfg.imapPort,
        secure: true,
        auth: { user: cfg.imapUser, pass: cfg.imapPass },
        logger: false,
      });
      await client.connect();
      try {
        const sentPath = await findSentMailbox(client);
        if (!sentPath) return "Sent, but the Hostinger Sent folder was not found.";
        await client.append(sentPath, raw, ["\\Seen"]);
        return undefined;
      } finally {
        await client.logout().catch(() => undefined);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  console.error("[mail] could not copy message to Sent folder:", lastError);
  return `Sent, but the copy to the Hostinger Sent folder failed: ${lastError}`.slice(0, 300);
}

export interface SyncResult {
  imported: number;
  skippedReason?: string;
}

type MailboxMessage = {
  uid: number;
  envelope?: { from?: { address?: string }[]; subject?: string; date?: Date };
  source?: Buffer;
};

export async function syncInbox(): Promise<SyncResult> {
  const cfg = mailConfig();
  if (!cfg.imapUser || !cfg.imapPass) {
    return { imported: 0, skippedReason: "Hostinger mailbox is not configured" };
  }

  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: true,
    auth: { user: cfg.imapUser, pass: cfg.imapPass },
    logger: false,
  });

  const prospects = await prisma.prospect.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, status: true },
  });
  const byEmail = new Map(
    prospects
      .filter((prospect) => prospect.email)
      .map((prospect) => [prospect.email!.toLowerCase(), prospect]),
  );
  const self = cfg.imapUser.toLowerCase();
  let imported = 0;
  const notes: string[] = [];

  await client.connect();
  try {
    imported += await syncFolder(client, "INBOX", "inbox", "in", byEmail, self);
    const sentPath = await findSentMailbox(client);
    if (sentPath) {
      imported += await syncFolder(client, sentPath, "sent", "out", byEmail, self);
    } else {
      notes.push("The sent folder was not found, so only received mail was loaded.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the mailbox";
    notes.push(message);
  } finally {
    try {
      await client.logout();
    } catch {
      // The connection may already be closed.
    }
  }

  return {
    imported,
    skippedReason: notes.length && imported === 0 ? notes.join(" ") : undefined,
  };
}

async function findSentMailbox(client: ImapFlow): Promise<string | null> {
  const boxes = await client.list();
  const special = boxes.find((box) => box.specialUse === "\\Sent");
  if (special?.path) return special.path;
  const named = boxes.find((box) => /sent/i.test(box.path) && !/draft/i.test(box.path));
  return named?.path ?? null;
}

async function syncFolder(
  client: ImapFlow,
  mailbox: string,
  cursorId: string,
  direction: "in" | "out",
  byEmail: Map<string, { id: string; email: string | null; status: string }>,
  self: string,
): Promise<number> {
  const cursor = await prisma.mailCursor.upsert({
    where: { id: cursorId },
    create: { id: cursorId, lastUid: 0 },
    update: {},
  });
  let imported = 0;
  let lastUid = cursor.lastUid;
  let uidValidity = cursor.uidValidity;
  const lock = await client.getMailboxLock(mailbox);
  try {
    const status = await client.status(mailbox, { uidNext: true, uidValidity: true });
    const uidNext = status.uidNext ?? 1;
    const validity = status.uidValidity === undefined ? null : String(status.uidValidity);
    if (validity && uidValidity && validity !== uidValidity) {
      // The server renumbered this folder, so old UIDs mean nothing. Message-IDs still dedupe.
      lastUid = 0;
    }
    uidValidity = validity ?? uidValidity;
    let maxUid = lastUid;
    const start = lastUid > 0 ? lastUid + 1 : Math.max(1, uidNext - 200);
    if (start < uidNext) {
      for await (const message of client.fetch(`${start}:*`, {
        uid: true,
        envelope: true,
        source: true,
      })) {
        maxUid = Math.max(maxUid, message.uid);
        const stored = await storeMailboxMessage(message, direction, byEmail, self);
        if (stored) imported += 1;
      }
    }
    lastUid = maxUid;
  } finally {
    lock.release();
  }
  if (lastUid !== cursor.lastUid || uidValidity !== cursor.uidValidity) {
    await prisma.mailCursor.update({
      where: { id: cursorId },
      data: { lastUid, uidValidity },
    });
  }
  return imported;
}

async function storeMailboxMessage(
  message: MailboxMessage,
  direction: "in" | "out",
  byEmail: Map<string, { id: string; email: string | null; status: string }>,
  self: string,
): Promise<boolean> {
  const parsed = message.source ? await simpleParser(message.source) : null;
  const from =
    parsed?.from?.value?.[0]?.address?.toLowerCase() ||
    message.envelope?.from?.[0]?.address?.toLowerCase() ||
    "";
  if (!from && direction === "in") return false;

  const to = formatAddress(parsed, self);
  const other = direction === "out" ? firstAddress(to) : from;
  const prospect = byEmail.get(other);
  const messageId = parsed?.messageId || `${direction}:${message.uid}`;
  const existing = await prisma.inboxMessage.findUnique({ where: { messageId } });
  if (existing) return false;

  const attachments = await storeParsedFiles(
    (parsed?.attachments ?? []).map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
      size: file.size,
      contentDisposition: file.contentDisposition,
    })),
  );

  await prisma.inboxMessage.create({
    data: {
      prospectId: prospect?.id,
      direction,
      from: from || self,
      to,
      subject: parsed?.subject || message.envelope?.subject || "(no subject)",
      body: (parsed?.text || htmlToText(parsed?.html) || "").slice(0, 20_000),
      attachments: JSON.stringify(attachments),
      messageId,
      receivedAt: parsed?.date || message.envelope?.date || new Date(),
    },
  });

  if (direction === "in" && prospect && (prospect.status === "sent" || prospect.status === "drafted")) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { status: "replied", lastError: null },
    });
    prospect.status = "replied";
  }
  return true;
}

/** Plain text for HTML-only mail, which webmail sends when there is formatting or an attachment. */
function htmlToText(html: string | false | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstAddress(value: string): string {
  return value.split(",")[0]?.trim().toLowerCase() ?? "";
}

function formatAddress(parsed: ParsedMail | null, fallback: string): string {
  if (!parsed?.to) return fallback;
  const list = Array.isArray(parsed.to) ? parsed.to : [parsed.to];
  const text = list.map((item) => item.text).filter(Boolean).join(", ");
  return text || fallback;
}
