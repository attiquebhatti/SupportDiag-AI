import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { createSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/auth/sso?ticket=<jwt>
//
// Cross-app single sign-on entry point. TheCyberAdviser site mints a
// short-lived HS256 ticket (signed with SUPPORTDIAG_SSO_SECRET, audience
// "supportdiag") for an already-authenticated site user. Here we verify it,
// find-or-create the local user by email, set the fl_session cookie, and land
// on the dashboard — mirroring the Google OAuth callback.

interface TicketClaims {
  sub?: string; // external user id on the site
  email?: string;
  name?: string;
}

function fail(base: string, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, base));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  // This endpoint is always served from SupportDiag's own origin, so redirect
  // relative to it — never to NEXTAUTH_URL, which may point elsewhere.
  const base = url.origin;

  if (!config.sso.enabled) return fail(base, "sso_not_configured");

  const ticket = url.searchParams.get("ticket");
  if (!ticket) return fail(base, "sso_missing_ticket");

  // Verify the ticket: HS256, correct audience + issuer, unexpired.
  let claims: TicketClaims;
  try {
    const { payload } = await jwtVerify(
      ticket,
      new TextEncoder().encode(config.sso.secret),
      {
        algorithms: ["HS256"],
        audience: config.sso.audience,
        issuer: config.sso.issuer,
      }
    );
    claims = payload as TicketClaims;
  } catch {
    return fail(base, "sso_invalid_ticket");
  }

  const email = claims.email?.toLowerCase().trim();
  if (!email) return fail(base, "sso_no_email");

  // Find-or-create by email (same join key as the Google flow).
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
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
        name: claims.name || email.split("@")[0],
        email,
        passwordHash: null,
        authProvider: "thecyberadviser",
        role,
        organizationId,
      },
    });
  }

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
  return res;
}
