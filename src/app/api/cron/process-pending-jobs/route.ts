import { prisma } from "@/lib/prisma";
import { verifyCronAuth, apiError, json } from "@/lib/api";
import { config } from "@/lib/config";
import { processUpload } from "@/lib/processing";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/cron/process-pending-jobs
// Protected by CRON_SECRET. Processes a small batch of pending jobs so the app
// works without Redis/Celery/daemons — each cron tick advances the queue.
async function handle(request: Request) {
  if (!verifyCronAuth(request)) return apiError("Unauthorized", 401);

  // Reclaim jobs that have been PENDING, or FAILED with few attempts.
  const jobs = await prisma.analysisJob.findMany({
    where: {
      OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: 3 } }],
      upload: { deletedAt: null },
    },
    orderBy: { createdAt: "asc" },
    take: config.cron.batchSize,
  });

  const results: Array<{ uploadId: string; ok: boolean; error?: string }> = [];
  for (const job of jobs) {
    try {
      await processUpload(job.uploadId);
      results.push({ uploadId: job.uploadId, ok: true });
    } catch (err) {
      results.push({
        uploadId: job.uploadId,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return json({ processed: results.length, results });
}

export async function POST(request: Request) {
  return handle(request);
}

// Allow GET so Hostinger's simple cron (wget/curl GET) can also trigger it.
export async function GET(request: Request) {
  return handle(request);
}
