import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySession } from "./auth-token";

export async function readSession(): Promise<{ email: string } | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export function credentialsMatch(email: string, password: string): boolean {
  const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const expectedPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!expectedEmail || expectedPassword.length < 8) return false;
  if (email.trim().toLowerCase() !== expectedEmail) return false;
  const given = Buffer.from(password);
  const expected = Buffer.from(expectedPassword);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
