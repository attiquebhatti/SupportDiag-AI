import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "@/components/severity-badge";
import { FindingStatusControl } from "@/components/finding-status-control";
import { AnalystNote } from "@/components/analyst-note";
import { VendorBadge, ProductBadge } from "@/components/badges";
import { redactText } from "@/lib/redaction";

export const dynamic = "force-dynamic";

interface Evidence {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  snippet: string;
}

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ id: string; findingId: string }>;
}) {
  const { id, findingId } = await params;
  const finding = await prisma.finding.findFirst({ where: { id: findingId, uploadId: id } });
  if (!finding) notFound();

  const upload = await prisma.upload.findUnique({ where: { id } });
  const redact = upload?.redactByDefault ?? true;
  const evidence = (Array.isArray(finding.evidenceJson) ? finding.evidenceJson : []) as unknown as Evidence[];

  return (
    <div className="space-y-4">
      <Link href={`/uploads/${id}/findings`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to findings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <SeverityBadge severity={finding.severity} />
          <div>
            <h2 className="text-xl font-semibold">{finding.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <code>{finding.ruleId}</code> · {finding.category} · Confidence {finding.confidence}%
              <VendorBadge vendor={finding.vendor} />
              <ProductBadge product={finding.product} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
            <CardContent className="text-sm">{redactText(finding.description, {})}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Impact</CardTitle></CardHeader>
            <CardContent className="text-sm">{redactText(finding.impact, {})}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Evidence</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {evidence.length === 0 && <p className="text-sm text-muted-foreground">No evidence attached.</p>}
              {evidence.map((e, i) => (
                <div key={i} className="rounded-md border bg-muted/30">
                  <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs">
                    <code className="text-muted-foreground">{e.filePath}</code>
                    <Link
                      href={`/uploads/${id}/files?path=${encodeURIComponent(e.filePath)}`}
                      className="text-primary hover:underline"
                    >
                      Open file
                    </Link>
                  </div>
                  <pre className="overflow-x-auto p-3 text-xs">
                    <code>{redact ? redactText(e.snippet, {}) : e.snippet}</code>
                  </pre>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recommendation</CardTitle></CardHeader>
            <CardContent className="text-sm">{redactText(finding.recommendation, {})}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Triage</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Current status: <span className="font-medium">{finding.status.replace("_", " ")}</span>
              </p>
              <FindingStatusControl uploadId={id} findingId={finding.id} current={finding.status} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Analyst Note</CardTitle></CardHeader>
            <CardContent>
              <AnalystNote uploadId={id} findingId={finding.id} initialNote={finding.analystNote} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
