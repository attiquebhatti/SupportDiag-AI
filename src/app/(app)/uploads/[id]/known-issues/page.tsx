import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { redactText } from "@/lib/redaction";
import { AlertTriangle, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

const MATCH_STYLE: Record<string, string> = {
  "Exact Match": "border-red-500/30 bg-red-500/10 text-red-400",
  "Strong Candidate": "border-orange-500/30 bg-orange-500/10 text-orange-400",
  "Possible Match": "border-amber-500/30 bg-amber-500/10 text-amber-400",
  "Insufficient Evidence": "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

interface EvidenceHit {
  filePath: string;
  line: number;
  snippet: string;
}

export default async function KnownIssuesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matches = await prisma.knownIssueMatch.findMany({
    where: { uploadId: id },
    include: { knownIssue: true },
    orderBy: { confidence: "desc" },
  });

  const versionArtifact = await prisma.parsedArtifact.findFirst({
    where: { uploadId: id, artifactType: "panos-evidence-model" },
  });
  const detectedVersion = (versionArtifact?.dataJson as { detectedVersion?: string } | null)?.detectedVersion;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Known Issues</h2>
        <p className="text-sm text-muted-foreground">
          Version-aware matches against documented issue families
          {detectedVersion ? ` · detected PAN-OS ${detectedVersion}` : ""}. Match types are conservative —
          confirm against the referenced source before acting.
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-8 w-8" />
          No known-issue candidates matched the evidence in this case.
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => {
            const evidence = (Array.isArray(m.evidenceJson) ? m.evidenceJson : []) as unknown as EvidenceHit[];
            return (
              <Card key={m.id} className="card-hover">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{m.knownIssue.title}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge className={`border ${MATCH_STYLE[m.matchType] ?? MATCH_STYLE["Possible Match"]}`}>{m.matchType}</Badge>
                      <Badge className="border-border bg-muted text-muted-foreground">{m.confidence}%</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <code>{m.knownIssue.issueId}</code>
                    {m.knownIssue.fixedVersion ? ` · fixed in ${m.knownIssue.fixedVersion}` : ""}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{m.explanation}</p>

                  {evidence.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Matching evidence</div>
                      <div className="space-y-1">
                        {evidence.slice(0, 4).map((e, i) => (
                          <div key={i} className="rounded-md border bg-muted/30">
                            <div className="flex items-center justify-between border-b px-2 py-1 text-[11px]">
                              <code className="text-muted-foreground">{e.filePath}:{e.line}</code>
                              <Link href={`/uploads/${id}/files?path=${encodeURIComponent(e.filePath.split("::")[0])}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                                Open <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                            <pre className="thin-scroll overflow-x-auto p-2 text-[11px]"><code>{redactText(e.snippet)}</code></pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Recommended remediation</div>
                      <p className="mt-1 text-sm">{m.knownIssue.remediation}</p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Affected range</div>
                      <p className="mt-1 text-sm">
                        {m.knownIssue.minAffectedVersion ?? "—"} to {m.knownIssue.maxAffectedVersion ?? "—"}
                        {m.knownIssue.fixedVersion ? ` (fixed ${m.knownIssue.fixedVersion})` : ""}
                      </p>
                      <div className="mt-2 text-xs font-medium text-muted-foreground">Source</div>
                      <p className="mt-1 text-xs text-muted-foreground">{m.knownIssue.sourceReference}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-300">
        SupportDiag AI is an independent diagnostic assistant and does not replace official vendor technical support.
        Known-issue matches are heuristic and must be validated by a qualified engineer.
      </p>
    </div>
  );
}
