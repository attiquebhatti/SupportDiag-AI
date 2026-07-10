import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { config } from "@/lib/config";

export const runtime = "nodejs";

// GET /api/auth/google — start the OAuth 2.0 authorization-code flow.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const base = process.env.NEXTAUTH_URL || origin;

  if (!config.google.enabled) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", base));
  }

  // CSRF protection: random state stored in a short-lived httpOnly cookie.
  const state = randomBytes(24).toString("hex");
  const redirectUri = `${base.replace(/\/$/, "")}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", config.google.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("fl_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  return res;
}
