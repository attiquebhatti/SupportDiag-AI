import { prisma } from "@/lib/prisma";
import { requireUploadAccess, json } from "@/lib/api";

export const runtime = "nodejs";

// GET /api/uploads/[id]/files — metadata for all extracted files (no content)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const files = await prisma.extractedFile.findMany({
    where: { uploadId: id },
    select: { id: true, path: true, fileType: true, size: true, indexed: true },
    orderBy: { path: "asc" },
  });
  return json({ files });
}
