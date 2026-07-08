import { prisma } from "@/lib/prisma";
import { requireUploadAccess, json } from "@/lib/api";

export const runtime = "nodejs";

// GET /api/uploads/[id]/status — lightweight polling endpoint
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const job = await prisma.analysisJob.findUnique({ where: { uploadId: id } });
  return json({
    status: access.upload.status,
    job: job
      ? {
          status: job.status,
          currentStep: job.currentStep,
          progress: job.progress,
          errorMessage: job.errorMessage,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        }
      : null,
  });
}
