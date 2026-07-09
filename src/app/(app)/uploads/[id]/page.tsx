import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthRing } from "@/components/health-ring";
import { SeverityBadge } from "@/components/severity-badge";
import { VendorBadge, ProductBadge, ConfidenceBadge, UploadStatusBadge } from "@/components/badges";
import { computeHealthScore, healthBand, countBySeverity } from "@/lib/health";
import { redactSerial } from "@/lib/redaction";
import { Sparkles, Bot, FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upload = await prisma.upload.findUnique({
    where: { id },
    include: { device: true, findings: true },
  });
  if (!upload) redirect("/dashboard");
  if (upload.status !== "COMPLETED" && upload.status !== "FAILED") {
    redirect(`/uploads/${id}/status`);
  }

  const aiArtifact = await prisma.parsedArtifact.findFirst({
    where: { uploadId: id, artifactType: "ai-summary" },
  });

  const device = upload.device;
  const sevs = upload.findings.map((f) => ({
    severity: (f.severity.charAt(0) + f.severity.slice(1).toLowerCase()) as never,
  }));
  const score = upload.healthScore ?? computeHealthScore(sevs);
  const band = healthBand(score);
  const counts = countBySeverity(sevs);
  const aiData = aiArtifact?.dataJson as { summary?: string; detection?: { level?: string } } | null;
  const aiSummary = aiData?.summary;
  const vendor = upload.detectedVendor ?? upload.selectedVendor ?? null;
  const product = upload.detectedProduct ?? upload.selectedProduct ?? null;
  const confidenceLevel = aiData?.detection?.level ?? (upload.detectionConfidence != null ? (upload.detectionConfidence >= 60 ? "high" : upload.detectionConfidence >= 30 ? "medium" : "low") : "low");

  const topFindings = [...upload.findings]
    .sort((a, b) => {
      const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Case header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border stat-gradient p-4">
        <div className="flex flex-wrap items-center gap-2">
          <VendorBadge vendor={vendor} />
          <ProductBadge product={product} />
          <UploadStatusBadge status={upload.status} />
          <ConfidenceBadge level={confidenceLevel} />
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/uploads/${id}/ai`}><Bot className="h-4 w-4" /> Ask AI</Link></Button>
          <Button asChild size="sm"><Link href={`/uploads/${id}/report`}><FileDown className="h-4 w-4" /> Export report</Link></Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
      {/* Health + counts */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Health Score</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <HealthRing score={score} label={band.label} />
          <div className="grid w-full grid-cols-5 gap-1 text-center text-xs">
            {(["Critical", "High", "Medium", "Low", "Informational"] as const).map((s) => (
              <div key={s} className="rounded-md bg-muted/50 p-2">
                <div className="text-base font-bold">{counts[s]}</div>
                <div className="text-[10px] text-muted-foreground">{s === "Informational" ? "Info" : s}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Device summary */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Device Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <Row label="Hostname" value={device?.hostname} />
            <Row label="Serial number" value={redactSerial(device?.serialNumber)} />
            <Row label="Model" value={device?.model} />
            <Row label="PAN-OS version" value={device?.panosVersion} />
            <Row label="Uptime" value={device?.uptime} />
          </div>
          <div>
            <Row label="HA status" value={device?.haStatus} />
            <Row label="Panorama managed" value={device?.panoramaManaged ? "Yes" : "No"} />
            <Row label="Panorama server" value={device?.panoramaServer} />
            <Row label="Last commit" value={device?.lastCommitStatus} />
            <Row label="Device type" value={device?.deviceType} />
          </div>
        </CardContent>
      </Card>

      {/* AI summary */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI-generated summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">
            {aiSummary || "No AI summary available. Enable AI (ENABLE_AI=true) to generate an evidence-based summary."}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Independent diagnostic assistant — not an official Palo Alto Networks tool. Does not replace TAC.
          </p>
        </CardContent>
      </Card>

      {/* Top findings */}
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Top findings</CardTitle>
          <Link href={`/uploads/${id}/findings`} className="text-sm text-primary hover:underline">
            View all ({upload.findings.length})
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {topFindings.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No findings detected. 🎉</p>
          )}
          {topFindings.map((f) => (
            <Link
              key={f.id}
              href={`/uploads/${id}/findings/${f.id}`}
              className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent"
            >
              <SeverityBadge severity={f.severity} />
              <div className="flex-1">
                <div className="text-sm font-medium">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.category} · Confidence {f.confidence}%</div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
