import { prisma } from "@/lib/prisma";
import { requireUploadAccess, json } from "@/lib/api";

export const runtime = "nodejs";

// GET /api/uploads/[id]/ai/history
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const history = await prisma.aIConversation.findMany({
    where: { uploadId: id },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return json({ history });
}
