import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { config } from "./config";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

const secretKey = new TextEncoder().encode(config.auth.secret);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string | null;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${config.auth.sessionMaxAgeSeconds}s`)
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify<JWTPayload & Omit<SessionUser, "id">>(
      token,
      secretKey
    );
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as Role,
      organizationId: (payload.organizationId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(config.auth.sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: config.auth.sessionMaxAgeSeconds,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(config.auth.sessionCookie);
}

/** Read the current session user from the request cookie, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(config.auth.sessionCookie)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  // Ensure the user still exists (cheap check; cached by Prisma).
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true, organizationId: true },
  });
  return user;
}

/** Role capability helper. Admin > Engineer > Viewer. */
export function canWrite(role: Role): boolean {
  return role === "ADMIN" || role === "ENGINEER";
}

export function canAdmin(role: Role): boolean {
  return role === "ADMIN";
}
