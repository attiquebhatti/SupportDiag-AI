import { prisma } from "@/lib/prisma";
import { verifyCronAuth, apiError, json } from "@/lib/api";
import { config } from "@/lib/config";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/cron/cleanup-expired-files
// Removes archives + extracted content for uploads older than the retention
// window. Metadata rows are soft-deleted so history/audit remains.
async function handle(request: Request) {
  if (!verifyCronAuth(request)) return apiError("Unauthorized", 401);

  // Heartbeat for the Admin Health page.
  await prisma.systemState.upsert({
    where: { key: "last-cron-cleanup" },
    update: { value: new Date().toISOString() },
    create: { key: "last-cron-cleanup", value: new Date().toISOString() },
  }).catch(() => {});

  const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000);
  const expired = await prisma.upload.findMany({
    where: { createdAt: { lt: cutoff }, deletedAt: null },
    select: { id: true, archiveStoragePath: true },
    take: 100,
  });

  const storage = getStorage();
  let purged = 0;
  for (const upload of expired) {
    if (upload.archiveStoragePath) {
      await storage.remove(upload.archiveStoragePath).catch(() => {});
    }
    await prisma.$transaction([
      prisma.extractedFile.deleteMany({ where: { uploadId: upload.id } }),
      prisma.parsedArtifact.deleteMany({ where: { uploadId: upload.id } }),
      prisma.finding.deleteMany({ where: { uploadId: upload.id } }),
      prisma.aIConversation.deleteMany({ where: { uploadId: upload.id } }),
      prisma.report.deleteMany({ where: { uploadId: upload.id } }),
      prisma.device.deleteMany({ where: { uploadId: upload.id } }),
      prisma.upload.update({
        where: { id: upload.id },
        data: { status: "DELETED", deletedAt: new Date(), archiveStoragePath: "" },
      }),
    ]);
    purged++;
  }

  return json({ purged, retentionDays: config.retentionDays });
}

export async function POST(request: Request) {
  return handle(request);
}
export async function GET(request: Request) {
  return handle(request);
}
