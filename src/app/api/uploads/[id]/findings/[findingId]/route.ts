import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUploadAccess, apiError, json } from "@/lib/api";
import { canWrite } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/uploads/[id]/findings/[findingId]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { id, findingId } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const finding = await prisma.finding.findFirst({ where: { id: findingId, uploadId: id } });
  if (!finding) return apiError("Finding not found", 404);
  return json({ finding });
}

const patchSchema = z.object({
  status: z.enum(["OPEN", "VALID", "FALSE_POSITIVE", "NEEDS_REVIEW"]),
});

// PATCH /api/uploads/[id]/findings/[findingId] — triage status
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { id, findingId } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;
  if (!canWrite(access.user.role)) return apiError("Forbidden", 403);

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid status", 422);

  const existing = await prisma.finding.findFirst({ where: { id: findingId, uploadId: id } });
  if (!existing) return apiError("Finding not found", 404);

  const finding = await prisma.finding.update({
    where: { id: findingId },
    data: { status: parsed.data.status },
  });
  return json({ finding });
}
