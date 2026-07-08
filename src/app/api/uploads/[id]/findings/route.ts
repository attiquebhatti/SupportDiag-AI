import { prisma } from "@/lib/prisma";
import { requireUploadAccess, json } from "@/lib/api";
import type { Severity, FindingStatus } from "@prisma/client";

export const runtime = "nodejs";

// GET /api/uploads/[id]/findings?severity=&status=&category=
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const url = new URL(req.url);
  const severity = url.searchParams.get("severity") as Severity | null;
  const status = url.searchParams.get("status") as FindingStatus | null;
  const category = url.searchParams.get("category");

  const findings = await prisma.finding.findMany({
    where: {
      uploadId: id,
      ...(severity ? { severity } : {}),
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: [{ severity: "asc" }, { confidence: "desc" }],
  });

  // Prisma enum order is alphabetical; re-sort by true severity priority.
  const order: Record<string, number> = {
    CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4,
  };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return json({
    findings: findings.map((f) => ({
      ...f,
      evidenceCount: Array.isArray(f.evidenceJson) ? f.evidenceJson.length : 0,
    })),
  });
}
