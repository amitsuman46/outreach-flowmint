import { NextResponse } from "next/server";
import { COOKIE_NAME, signSession } from "@/lib/auth-token";
import { loginSchema } from "@/lib/schemas";
import { credentialsMatch } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your email and password" }, { status: 400 });
  }
  if (!credentialsMatch(parsed.data.email, parsed.data.password)) {
    return NextResponse.json({ error: "Email or password is wrong" }, { status: 401 });
  }
  const token = await signSession(parsed.data.email.trim().toLowerCase());
  const response = NextResponse.json({ email: parsed.data.email.trim().toLowerCase() });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
