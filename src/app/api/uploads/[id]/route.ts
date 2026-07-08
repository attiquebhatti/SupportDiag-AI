import { prisma } from "@/lib/prisma";
import { requireUploadAccess, apiError, json } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

// GET /api/uploads/[id]
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const upload = await prisma.upload.findUnique({
    where: { id },
    include: {
      job: true,
      device: true,
      _count: { select: { findings: true, extractedFiles: true } },
    },
  });
  return json({ upload });
}

// DELETE /api/uploads/[id] — soft delete + purge stored archive and content
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;
  const { user, upload } = access;

  if (!canWrite(user.role) && upload.userId !== user.id) {
    return apiError("Forbidden", 403);
  }

  // Remove the archive from object storage (best effort).
  if (upload.archiveStoragePath) {
    await getStorage().remove(upload.archiveStoragePath).catch(() => {});
  }

  // Purge extracted content and mark the case deleted. Cascades remove
  // findings/artifacts/conversations/reports via the schema relations.
  await prisma.$transaction([
    prisma.extractedFile.deleteMany({ where: { uploadId: id } }),
    prisma.parsedArtifact.deleteMany({ where: { uploadId: id } }),
    prisma.finding.deleteMany({ where: { uploadId: id } }),
    prisma.aIConversation.deleteMany({ where: { uploadId: id } }),
    prisma.report.deleteMany({ where: { uploadId: id } }),
    prisma.device.deleteMany({ where: { uploadId: id } }),
    prisma.upload.update({
      where: { id },
      data: { status: "DELETED", deletedAt: new Date(), archiveStoragePath: "" },
    }),
  ]);

  return json({ ok: true });
}
