import type { SessionUser } from "./auth";
import type { Prisma } from "@prisma/client";

/** Where-clause scoping uploads to the user's own cases or their organization. */
export function uploadScope(user: SessionUser): Prisma.UploadWhereInput {
  return {
    deletedAt: null,
    OR: [
      { userId: user.id },
      user.organizationId ? { organizationId: user.organizationId } : { id: "__none__" },
    ],
  };
}
