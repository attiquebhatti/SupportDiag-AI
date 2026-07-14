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
import { getCurrentUser, canWrite } from "@/lib/auth";

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
  const user = await getCurrentUser();
  const writer = user ? canWrite(user.role) : false;
  const evidence = (Array.isArray(finding.evidenceJson) ? finding.evidenceJson : []) as unknown as Evidence[];
  const details = (finding.detailsJson ?? null) as {
    plane?: string;
    affectedProcess?: string;
    probableCause?: string;
    alternativeCauses?: string[];
    knownIssuePossibility?: string;
    correlation?: string[];
  } | null;

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

          {details && (details.probableCause || details.correlation?.length || details.alternativeCauses?.length) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Root-Cause Analysis</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {(details.plane || details.affectedProcess) && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {details.plane && <span className="rounded-full border bg-muted px-2 py-0.5">Plane: {details.plane.toUpperCase()}</span>}
                    {details.affectedProcess && <span className="rounded-full border bg-muted px-2 py-0.5">Process: {details.affectedProcess}</span>}
                  </div>
                )}
                {details.probableCause && (
                  <div><span className="font-medium">Probable cause:</span> {redactText(details.probableCause, {})}</div>
                )}
                {details.alternativeCauses && details.alternativeCauses.length > 0 && (
                  <div>
                    <span className="font-medium">Alternative causes:</span>
                    <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                      {details.alternativeCauses.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
                {details.correlation && details.correlation.length > 0 && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
                    <span className="text-xs font-medium text-primary">Correlated evidence</span>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {details.correlation.map((c, i) => <li key={i}>• {c}</li>)}
                    </ul>
                  </div>
                )}
                {details.knownIssuePossibility && (
                  <p className="text-xs text-muted-foreground">
                    <Link href={`/uploads/${id}/known-issues`} className="text-primary hover:underline">{details.knownIssuePossibility}</Link>
                  </p>
                )}
              </CardContent>
            </Card>
          )}
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
              {writer ? (
                <FindingStatusControl uploadId={id} findingId={finding.id} current={finding.status} />
              ) : (
                <p className="text-xs text-muted-foreground">Read-only role — triage is disabled.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Analyst Note</CardTitle></CardHeader>
            <CardContent>
              {writer ? (
                <AnalystNote uploadId={id} findingId={finding.id} initialNote={finding.analystNote} />
              ) : finding.analystNote ? (
                <p className="text-sm">{finding.analystNote}</p>
              ) : (
                <p className="text-xs text-muted-foreground">No analyst note.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
