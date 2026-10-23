import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "desk_token";

function secret(): Uint8Array | null {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) return null;
  return new TextEncoder().encode(value);
}

export async function signSession(email: string): Promise<string> {
  const key = secret();
  if (!key) {
    throw new Error("JWT_SECRET must be at least 16 characters");
  }
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setExpirationTime("7d")
    .sign(key);
}

export async function verifySession(
  token: string,
): Promise<{ email: string } | null> {
  const key = secret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const email = payload.email;
    if (typeof email !== "string" || !email) return null;
    return { email };
  } catch {
    return null;
  }
}
