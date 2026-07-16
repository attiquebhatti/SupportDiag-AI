import { NextResponse } from "next/server";
import { getCurrentUser, canWrite, type SessionUser } from "./auth";
import { prisma } from "./prisma";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Resolve the authenticated user or return a 401 response. */
export async function requireUser(): Promise<
  { user: SessionUser } | { response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { response: apiError("Unauthorized", 401) };
  return { user };
}

export async function requireWriter(): Promise<
  { user: SessionUser } | { response: NextResponse }
> {
  const result = await requireUser();
  if ("response" in result) return result;
  if (!canWrite(result.user.role)) {
    return { response: apiError("Forbidden: insufficient role", 403) };
  }
  return result;
}

/**
 * Load an upload the current user owns, or return a 404 response. Uploads are
 * isolated per user, so a non-owner is treated as if the upload does not exist.
 * Excludes soft-deleted uploads.
 */
export async function requireUploadAccess(uploadId: string) {
  const result = await requireUser();
  if ("response" in result) return result;
  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.deletedAt) {
    return { response: apiError("Upload not found", 404) };
  }
  const { user } = result;
  // Per-user isolation: only the owner may access an upload. Return 404 (not
  // 403) so the existence of another user's case is never revealed.
  if (upload.userId !== user.id) {
    return { response: apiError("Upload not found", 404) };
  }
  return { user, upload };
}

export function verifyCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key") || "";
  return bearer === secret || queryKey === secret;
}
