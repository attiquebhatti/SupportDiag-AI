import { prisma } from "@/lib/prisma";
import { requireUploadAccess, json } from "@/lib/api";
import { computeHealthScore, healthBand, countBySeverity } from "@/lib/health";

export const runtime = "nodejs";

// GET /api/uploads/[id]/summary — overview payload for the analysis page
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const [device, findings, aiArtifact, contentArtifact, licenseArtifact] = await Promise.all([
    prisma.device.findUnique({ where: { uploadId: id } }),
    prisma.finding.findMany({ where: { uploadId: id } }),
    prisma.parsedArtifact.findFirst({ where: { uploadId: id, artifactType: "ai-summary" } }),
    prisma.parsedArtifact.findFirst({ where: { uploadId: id, artifactType: "content-versions" } }),
    prisma.parsedArtifact.findFirst({ where: { uploadId: id, artifactType: "licenses" } }),
  ]);

  const sevs = findings.map((f) => ({
    severity: (f.severity.charAt(0) + f.severity.slice(1).toLowerCase()) as never,
  }));
  const score = access.upload.healthScore ?? computeHealthScore(sevs);
  const counts = countBySeverity(sevs);

  return json({
    upload: {
      id: access.upload.id,
      originalFilename: access.upload.originalFilename,
      status: access.upload.status,
      createdAt: access.upload.createdAt,
      redactByDefault: access.upload.redactByDefault,
    },
    device,
    healthScore: score,
    healthBand: healthBand(score),
    counts,
    criticalCount: counts.Critical,
    highCount: counts.High,
    aiSummary: (aiArtifact?.dataJson as { summary?: string } | null)?.summary ?? null,
    contentVersions: contentArtifact?.dataJson ?? null,
    licenses: licenseArtifact?.dataJson ?? null,
  });
}
