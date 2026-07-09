import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadScope } from "@/lib/scope";
import { FindingsConsole, type FindingRow } from "@/components/findings-console";

export const dynamic = "force-dynamic";

export default async function GlobalFindingsPage() {
  const user = await getCurrentUser();
  const scope = uploadScope(user!);

  const findings = await prisma.finding.findMany({
    where: { upload: scope },
    orderBy: [{ severity: "asc" }, { confidence: "desc" }],
    take: 500,
    include: { upload: { select: { id: true, originalFilename: true } } },
  });

  const rows: FindingRow[] = findings.map((f) => ({
    id: f.id,
    uploadId: f.uploadId,
    caseName: f.upload.originalFilename,
    severity: f.severity,
    vendor: f.vendor,
    product: f.product,
    category: f.category,
    title: f.title,
    impact: f.impact,
    confidence: f.confidence,
    status: f.status,
    evidenceCount: Array.isArray(f.evidenceJson) ? (f.evidenceJson as unknown[]).length : 0,
    recommendation: f.recommendation,
    createdAt: f.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Diagnostic Findings</h1>
        <p className="text-sm text-muted-foreground">Every finding across your workspace, filterable by severity, vendor, category, and status.</p>
      </div>
      <FindingsConsole rows={rows} />
    </div>
  );
}
