import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth-token";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
