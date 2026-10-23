import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type StoredAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
};

export type OutgoingFile = {
  filename: string;
  content: Buffer;
  contentType: string;
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 8;

export function mailDir(): string {
  return path.join(process.cwd(), "storage", "mail");
}

export function parseAttachments(raw: string | null | undefined): StoredAttachment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.name !== "string") return [];
      return [{
        id: record.id,
        name: record.name,
        size: typeof record.size === "number" ? record.size : 0,
        type: typeof record.type === "string" ? record.type : "application/octet-stream",
      }];
    });
  } catch {
    return [];
  }
}

export async function readUploads(entries: FormDataEntryValue[]): Promise<OutgoingFile[]> {
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > MAX_FILES) {
    throw new Error(`Attach up to ${MAX_FILES} files.`);
  }
  const outgoing: OutgoingFile[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`${file.name || "A file"} is larger than 8 MB.`);
    }
    outgoing.push({
      filename: safeName(file.name),
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
    });
  }
  return outgoing;
}

export async function storeOutgoing(files: OutgoingFile[]): Promise<StoredAttachment[]> {
  if (!files.length) return [];
  const dir = mailDir();
  await mkdir(dir, { recursive: true });
  const stored: StoredAttachment[] = [];
  for (const file of files) {
    const id = randomUUID();
    await writeFile(path.join(dir, id), file.content);
    stored.push({
      id,
      name: file.filename,
      size: file.content.length,
      type: file.contentType,
    });
  }
  return stored;
}

export async function storeParsedFiles(
  files: Array<{
    filename?: string;
    content: Buffer;
    contentType: string;
    size: number;
    contentDisposition?: string;
  }>,
): Promise<StoredAttachment[]> {
  const dir = mailDir();
  await mkdir(dir, { recursive: true });
  const stored: StoredAttachment[] = [];
  for (const file of files) {
    if (!file.content?.length || file.content.length > MAX_FILE_BYTES) continue;
    if (file.contentDisposition === "inline" && !file.filename) continue;
    const id = randomUUID();
    await writeFile(path.join(dir, id), file.content);
    stored.push({
      id,
      name: safeName(file.filename || "attachment"),
      size: file.content.length,
      type: file.contentType || "application/octet-stream",
    });
    if (stored.length >= MAX_FILES) break;
  }
  return stored;
}

export async function readStoredFile(id: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("Unknown file");
  }
  return readFile(path.join(mailDir(), id));
}

export function safeName(name: string): string {
  const cleaned = name.replace(/[\r\n"]/g, "").trim() || "attachment";
  return cleaned.slice(0, 120);
}
