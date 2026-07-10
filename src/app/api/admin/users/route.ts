import { prisma } from "@/lib/prisma";
import { requireUser, apiError, json } from "@/lib/api";
import { canAdmin } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/admin/users — list workspace users (Admin only)
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!canAdmin(auth.user.role)) return apiError("Forbidden: admin only", 403);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      authProvider: true,
      createdAt: true,
      _count: { select: { uploads: true } },
    },
  });
  return json({ users });
}
