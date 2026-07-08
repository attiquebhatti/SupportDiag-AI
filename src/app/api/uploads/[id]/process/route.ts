import { prisma } from "@/lib/prisma";
import { requireUploadAccess, apiError, json } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { processUpload } from "@/lib/processing";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/uploads/[id]/process — run analysis now (synchronous within request).
// The cron endpoint is the primary path; this lets a user trigger immediately.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;
  if (!canWrite(access.user.role)) return apiError("Forbidden", 403);

  const job = await prisma.analysisJob.findUnique({ where: { uploadId: id } });
  if (job?.status === "RUNNING") {
    return json({ status: "already-running" }, 202);
  }

  try {
    await processUpload(id);
    return json({ status: "completed" });
  } catch (err) {
    return apiError(
      `Processing failed: ${err instanceof Error ? err.message : "unknown"}`,
      500
    );
  }
}
