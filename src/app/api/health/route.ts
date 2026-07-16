import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health — unauthenticated deployment health check.
// Reports whether the database is reachable and migrated, exposing only the
// Prisma error code (never the connection string or query details) so a
// failing deployment can be diagnosed remotely.
export async function GET() {
  const health: {
    status: "ok" | "degraded";
    database: "connected" | "error";
    dbErrorCode?: string;
    dbErrorHint?: string;
    userTable?: "present" | "missing";
    time: string;
  } = { status: "ok", database: "connected", time: new Date().toISOString() };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    health.status = "degraded";
    health.database = "error";
    health.dbErrorCode = extractCode(err);
    health.dbErrorHint = sanitizeMessage(err);
    return NextResponse.json(health, { status: 503 });
  }

  try {
    await prisma.user.count();
    health.userTable = "present";
  } catch (err) {
    health.status = "degraded";
    health.userTable = "missing";
    health.dbErrorCode = extractCode(err);
    return NextResponse.json(health, { status: 503 });
  }

  return NextResponse.json(health);
}

function extractCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: string; errorCode?: string; name?: string };
    return e.code ?? e.errorCode ?? e.name ?? "unknown";
  }
  return "unknown";
}

// First line of the error message with anything secret-shaped removed:
// credentials inside connection URLs and quoted passwords never leave the box.
function sanitizeMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const meaningful = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("Invalid `prisma."))
    .slice(0, 2)
    .join(" ")
    .slice(0, 300);
  return meaningful
    .replace(/mysql:\/\/[^@\s]*@/gi, "mysql://***:***@")
    .replace(/password[^,;\s]*/gi, "password=***");
}
