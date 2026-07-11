import Link from "next/link";
import {
  UploadCloud, FileText, ShieldAlert, AlertTriangle, Activity, XCircle,
  Boxes, Clock, ArrowRight, ListChecks, RefreshCw,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadScope } from "@/lib/scope";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthRing } from "@/components/health-ring";
import { SeverityDonut, CategoryBars } from "@/components/dashboard-charts";
import { RecentAnalyses, type AnalysisRow } from "@/components/recent-analyses";
import { ProductStatusBadge } from "@/components/badges";
import { Icon } from "@/components/icon";
import { PRODUCTS } from "@/lib/vendors";
import { healthBand } from "@/lib/health";
import { formatDate } from "@/lib/utils";
import { RetryButton } from "@/components/retry-button";

export const dynamic = "force-dynamic";

function Stat({ label, value, icon: Icn, accent, sub }: { label: string; value: string | number; icon: React.ElementType; accent: string; sub?: string }) {
  return (
    <Card className="card-hover stat-gradient">
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`rounded-lg p-2.5 ${accent}`}><Icn className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {sub && <div className="mt-0.5 text-[10px] text-muted-foreground/70">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const scope = uploadScope(user!);
  const writer = user!.role === "ADMIN" || user!.role === "ENGINEER";

  const [uploads, totalAnalyses, failedCount, findingAgg, catAgg, topFindings] = await Promise.all([
    prisma.upload.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { device: true, assets: { take: 1 }, user: { select: { name: true } } },
    }),
    prisma.upload.count({ where: scope }),
    prisma.upload.count({ where: { ...scope, status: "FAILED" } }),
    prisma.finding.groupBy({ by: ["severity"], _count: true, where: { upload: scope } }),
    prisma.finding.groupBy({ by: ["category"], _count: true, where: { upload: scope } }),
    prisma.finding.findMany({
      where: { upload: scope, severity: { in: ["CRITICAL", "HIGH"] }, status: { not: "FALSE_POSITIVE" } },
      orderBy: [{ severity: "asc" }, { confidence: "desc" }],
      take: 5,
      include: { upload: { select: { id: true, originalFilename: true } } },
    }),
  ]);

  const sevCount = (s: string) => findingAgg.find((f) => f.severity === s)?._count ?? 0;
  const critical = sevCount("CRITICAL");
  const high = sevCount("HIGH");

  const scored = await prisma.upload.findMany({ where: { ...scope, healthScore: { not: null } }, select: { healthScore: true } });
  const avgHealth = scored.length ? Math.round(scored.reduce((s, u) => s + (u.healthScore ?? 0), 0) / scored.length) : 0;

  const lastAnalysis = uploads[0]?.createdAt ? formatDate(uploads[0].createdAt) : "—";

  const rows: AnalysisRow[] = uploads.map((u) => ({
    id: u.id,
    originalFilename: u.originalFilename,
    status: u.status,
    vendor: u.detectedVendor ?? u.selectedVendor ?? u.assets[0]?.vendor ?? null,
    product: u.detectedProduct ?? u.selectedProduct ?? u.assets[0]?.product ?? null,
    hostname: u.device?.hostname ?? u.assets[0]?.hostname ?? null,
    healthScore: u.healthScore,
    critical: 0,
    high: 0,
    uploadedBy: u.user?.name ?? "—",
    createdAt: u.createdAt.toISOString(),
  }));

  // per-upload crit/high counts
  const perUpload = await prisma.finding.groupBy({
    by: ["uploadId", "severity"],
    _count: true,
    where: { uploadId: { in: uploads.map((u) => u.id) }, severity: { in: ["CRITICAL", "HIGH"] } },
  });
  for (const row of rows) {
    row.critical = perUpload.find((p) => p.uploadId === row.id && p.severity === "CRITICAL")?._count ?? 0;
    row.high = perUpload.find((p) => p.uploadId === row.id && p.severity === "HIGH")?._count ?? 0;
  }

  const severityData = [
    { name: "Critical", value: sevCount("CRITICAL") },
    { name: "High", value: sevCount("HIGH") },
    { name: "Medium", value: sevCount("MEDIUM") },
    { name: "Low", value: sevCount("LOW") },
    { name: "Informational", value: sevCount("INFORMATIONAL") },
  ];
  const categoryData = catAgg
    .map((c) => ({ category: c.category, count: c._count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const failedUploads = await prisma.upload.findMany({
    where: { ...scope, status: "FAILED" },
    include: { job: true },
    orderBy: { createdAt: "desc" },
    take: 4,
  });

  const band = healthBand(avgHealth);
  const supportedVendors = new Set(PRODUCTS.filter((p) => p.status !== "planned").map((p) => p.vendor)).size;

  const isEmpty = totalAnalyses === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground">AI-powered support file diagnostics for security and network teams.</p>
        </div>
        {writer && (
          <Button asChild size="lg">
            <Link href="/upload"><UploadCloud className="h-4 w-4" /> New Diagnostic Analysis</Link>
          </Button>
        )}
      </div>

      {isEmpty ? (
        <EmptyState writer={writer} />
      ) : (
        <>
          {/* Hero stats */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total analyses" value={totalAnalyses} icon={FileText} accent="bg-primary/15 text-primary" />
            <Stat label="Critical findings" value={critical} icon={ShieldAlert} accent="bg-red-500/15 text-red-500" />
            <Stat label="High findings" value={high} icon={AlertTriangle} accent="bg-orange-500/15 text-orange-500" />
            <Stat label="Avg health" value={avgHealth} icon={Activity} accent="bg-emerald-500/15 text-emerald-500" sub={band.label} />
            <Stat label="Processing failed" value={failedCount} icon={XCircle} accent="bg-red-500/15 text-red-500" />
            <Stat label="Vendors supported" value={supportedVendors} icon={Boxes} accent="bg-blue-500/15 text-blue-400" sub={`${PRODUCTS.length} products`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Health overview */}
            <Card className="card-hover">
              <CardHeader><CardTitle className="text-base">Fleet Health</CardTitle></CardHeader>
              <CardContent className="flex flex-col items-center gap-2">
                <HealthRing score={avgHealth} label={band.label} />
                <p className="text-center text-xs text-muted-foreground">Average across {scored.length} analyzed case(s)</p>
                <p className="text-[11px] text-muted-foreground/70">Last analysis {lastAnalysis}</p>
              </CardContent>
            </Card>

            {/* Severity donut */}
            <Card className="card-hover">
              <CardHeader><CardTitle className="text-base">Findings by Severity</CardTitle></CardHeader>
              <CardContent><SeverityDonut data={severityData} /></CardContent>
            </Card>

            {/* Recommended actions */}
            <Card className="card-hover">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-primary" /> Recommended Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {topFindings.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No priority actions. 🎉</p>}
                {topFindings.map((f) => (
                  <Link key={f.id} href={`/uploads/${f.uploadId}/findings/${f.id}`} className="flex items-start gap-2 rounded-md border p-2 text-xs hover:bg-accent">
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${f.severity === "CRITICAL" ? "bg-red-500" : "bg-orange-500"}`} />
                    <div>
                      <div className="font-medium">{f.title}</div>
                      <div className="text-muted-foreground">{f.upload.originalFilename}</div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Vendor coverage */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Vendor Coverage</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {PRODUCTS.map((p) => {
                const count = uploads.filter((u) => (u.detectedProduct ?? u.selectedProduct) === p.id).length;
                return (
                  <Card key={p.id} className="card-hover">
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><Icon name={p.icon} className="h-4 w-4 text-primary" /></div>
                        <ProductStatusBadge status={p.status} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{p.shortLabel}</div>
                        <div className="text-[11px] text-muted-foreground">{p.blurb}</div>
                      </div>
                      <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                        <span>{count} analyzed</span>
                        <span className="capitalize">Maturity: {p.maturity}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Category chart + failed panel */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="card-hover lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Findings by Category</CardTitle></CardHeader>
              <CardContent><CategoryBars data={categoryData} /></CardContent>
            </Card>
            <Card className="card-hover">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><XCircle className="h-4 w-4 text-red-500" /> Processing Failed</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {failedUploads.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No failed analyses.</p>}
                {failedUploads.map((u) => (
                  <div key={u.id} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/uploads/${u.id}/status`} className="truncate font-medium hover:text-primary">{u.originalFilename}</Link>
                      <RetryButton uploadId={u.id} />
                    </div>
                    <div className="mt-1 text-muted-foreground">{u.job?.errorMessage || "Unknown error"}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent analyses */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Recent Analyses</h2>
              <Link href="/cases" className="flex items-center gap-1 text-sm text-primary hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <RecentAnalyses rows={rows} />
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ writer }: { writer: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><UploadCloud className="h-8 w-8 text-primary" /></div>
        <div>
          <h2 className="text-lg font-semibold">{writer ? "Upload your first support bundle" : "No analyses in this workspace yet"}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {writer
              ? "Upload a vendor support bundle to generate evidence-based findings. Sensitive values are redacted by default."
              : "Analyses uploaded by your team will appear here. Your role has read-only access."}
          </p>
        </div>
        {writer && (
          <Button asChild size="lg"><Link href="/upload"><UploadCloud className="h-4 w-4" /> New Diagnostic Analysis</Link></Button>
        )}
        <div className="mt-4 grid gap-2 text-left sm:grid-cols-2">
          {PRODUCTS.filter((p) => p.status !== "planned").map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <Icon name={p.icon} className="h-4 w-4 text-primary" />
              <span>{p.label}</span>
              <ProductStatusBadge status={p.status} className="ml-auto" />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Getting started: pick a vendor, upload, and let SupportDiag analyze the evidence.
        </div>
      </CardContent>
    </Card>
  );
}
