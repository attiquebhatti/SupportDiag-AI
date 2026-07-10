import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { createSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

function fail(base: string, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, base));
}

// GET /api/auth/google/callback — exchange the code, find-or-create the user,
// and establish a session.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.NEXTAUTH_URL || url.origin;

  if (!config.google.enabled) return fail(base, "google_not_configured");
  if (url.searchParams.get("error")) return fail(base, "google_denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader.match(/(?:^|;\s*)fl_oauth_state=([^;]+)/)?.[1];
  if (!code || !state || !stateCookie || state !== stateCookie) {
    return fail(base, "google_state");
  }

  const redirectUri = `${base.replace(/\/$/, "")}/api/auth/google/callback`;

  // 1. Exchange the authorization code for tokens.
  let accessToken: string;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail(base, "google_failed");
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return fail(base, "google_failed");
    accessToken = tokens.access_token;
  } catch {
    return fail(base, "google_failed");
  }

  // 2. Fetch the verified profile (server-to-server over TLS).
  let profile: GoogleUserInfo;
  try {
    const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) return fail(base, "google_failed");
    profile = (await infoRes.json()) as GoogleUserInfo;
  } catch {
    return fail(base, "google_failed");
  }

  if (!profile.sub || !profile.email || profile.email_verified === false) {
    return fail(base, "google_unverified");
  }

  // 3. Find or create the user. Link by googleId first, then by email.
  let user = await prisma.user.findUnique({ where: { googleId: profile.sub } });
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      // Link Google to the existing credentials account.
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: profile.sub, avatarUrl: profile.picture ?? byEmail.avatarUrl },
      });
    } else {
      // New signup. Mirrors /api/auth/register: first user becomes ADMIN.
      const userCount = await prisma.user.count();
      const role = userCount === 0 ? "ADMIN" : "ENGINEER";
      let organizationId: string | null = null;
      if (userCount === 0) {
        const org = await prisma.organization.create({
          data: { name: "Default Organization", plan: "startup", retentionDays: 7 },
        });
        organizationId = org.id;
      } else {
        const firstOrg = await prisma.organization.findFirst();
        organizationId = firstOrg?.id ?? null;
      }
      user = await prisma.user.create({
        data: {
          name: profile.name || profile.email.split("@")[0],
          email: profile.email,
          passwordHash: null,
          authProvider: "google",
          googleId: profile.sub,
          avatarUrl: profile.picture ?? null,
          role,
          organizationId,
        },
      });
    }
  }

  // 4. Establish the session and clean up the state cookie.
  const token = await createSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
  });

  const res = NextResponse.redirect(new URL("/dashboard", base));
  res.cookies.set(config.auth.sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: config.auth.sessionMaxAgeSeconds,
  });
  res.cookies.set("fl_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}
