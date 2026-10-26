import { prisma } from "./prisma";

/** Shared settings live in the database, so everyone using the desk sees the same values. */
export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

const TEMPLATE_SITE = "templateSiteUrl";

/** The one website shown to every lead in the "Without PPT" workflow. */
export async function templateSiteUrl(): Promise<string | null> {
  return getSetting(TEMPLATE_SITE);
}

export async function setTemplateSiteUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("That isn't a valid website address.");
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) {
    throw new Error("That isn't a valid website address.");
  }
  await setSetting(TEMPLATE_SITE, parsed.toString());
  return parsed.toString();
}
