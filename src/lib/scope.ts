import type { SessionUser } from "./auth";
import type { Prisma } from "@prisma/client";

/**
 * Where-clause scoping uploads to the current user's own cases only.
 * Each user has a fully isolated environment: they never see analyses created
 * by other users, regardless of shared organization or role.
 */
export function uploadScope(user: SessionUser): Prisma.UploadWhereInput {
  return {
    deletedAt: null,
    userId: user.id,
  };
}
