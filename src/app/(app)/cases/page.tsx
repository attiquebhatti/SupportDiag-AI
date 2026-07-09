import Link from "next/link";
import { UploadCloud, FolderSearch } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadScope } from "@/lib/scope";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RecentAnalyses, type AnalysisRow } from "@/components/recent-analyses";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const user = await getCurrentUser();
  const scope = uploadScope(user!);

  const uploads = await prisma.upload.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { device: true, assets: { take: 1 }, user: { select: { name: true } } },
  });

  const perUpload = await prisma.finding.groupBy({
    by: ["uploadId", "severity"],
    _count: true,
    where: { uploadId: { in: uploads.map((u) => u.id) }, severity: { in: ["CRITICAL", "HIGH"] } },
  });

  const rows: AnalysisRow[] = uploads.map((u) => ({
    id: u.id,
    originalFilename: u.originalFilename,
    status: u.status,
    vendor: u.detectedVendor ?? u.selectedVendor ?? u.assets[0]?.vendor ?? null,
    product: u.detectedProduct ?? u.selectedProduct ?? u.assets[0]?.product ?? null,
    hostname: u.device?.hostname ?? u.assets[0]?.hostname ?? null,
    healthScore: u.healthScore,
    critical: perUpload.find((p) => p.uploadId === u.id && p.severity === "CRITICAL")?._count ?? 0,
    high: perUpload.find((p) => p.uploadId === u.id && p.severity === "HIGH")?._count ?? 0,
    uploadedBy: u.user?.name ?? "—",
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cases / Analyses</h1>
          <p className="text-sm text-muted-foreground">All diagnostic analyses in this workspace.</p>
        </div>
        <Button asChild><Link href="/upload"><UploadCloud className="h-4 w-4" /> New Diagnostic Analysis</Link></Button>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderSearch className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No analyses yet.</p>
            <Button asChild><Link href="/upload">Upload your first support bundle</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <RecentAnalyses rows={rows} />
      )}
    </div>
  );
}
