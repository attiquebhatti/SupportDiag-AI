import { prisma } from "@/lib/prisma";
import { requireUploadAccess, json } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;
  const device = await prisma.device.findUnique({ where: { uploadId: id } });
  return json({ device });
}
