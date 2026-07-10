import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, apiError, json } from "@/lib/api";
import { canAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  role: z.enum(["ADMIN", "ENGINEER", "VIEWER"]),
});

async function adminGuard() {
  const auth = await requireUser();
  if ("response" in auth) return auth;
  if (!canAdmin(auth.user.role)) return { response: apiError("Forbidden: admin only", 403) };
  return auth;
}

// PATCH /api/admin/users/[userId] — change a user's role (Admin only)
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const auth = await adminGuard();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid role", 422);

  if (userId === auth.user.id) {
    return apiError("You cannot change your own role.", 400);
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return apiError("User not found", 404);

  // Never allow removing the last admin.
  if (target.role === "ADMIN" && parsed.data.role !== "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) return apiError("Cannot demote the last admin.", 400);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role: parsed.data.role },
    select: { id: true, name: true, email: true, role: true },
  });
  return json({ user });
}

// DELETE /api/admin/users/[userId] — remove a user (Admin only).
// Cascades delete the user's uploads and derived data per the schema.
export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const auth = await adminGuard();
  if ("response" in auth) return auth.response;

  if (userId === auth.user.id) {
    return apiError("You cannot delete your own account.", 400);
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return apiError("User not found", 404);

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) return apiError("Cannot delete the last admin.", 400);
  }

  await prisma.user.delete({ where: { id: userId } });
  return json({ ok: true });
}
