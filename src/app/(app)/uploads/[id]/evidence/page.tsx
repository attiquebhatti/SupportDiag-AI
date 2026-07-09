import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { redactText } from "@/lib/redaction";
import { SeverityBadge } from "@/components/severity-badge";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

interface Evidence { filePath: string; snippet: string; lineStart?: number }

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [findings, upload] = await Promise.all([
    prisma.finding.findMany({ where: { uploadId: id }, orderBy: { severity: "asc" } }),
    prisma.upload.findUnique({ where: { id }, select: { redactByDefault: true } }),
  ]);
  const redact = upload?.redactByDefault ?? true;

  const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  const withEvidence = sorted.filter((f) => Array.isArray(f.evidenceJson) && (f.evidenceJson as unknown[]).length > 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Evidence</h2>
        <p className="text-sm text-muted-foreground">Every evidence snippet backing the findings for this case. Click a path to open it in the File Explorer.</p>
      </div>

      {withEvidence.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8" /> No evidence recorded for this case.
        </div>
      ) : (
        <div className="space-y-4">
          {withEvidence.map((f) => {
            const evidence = f.evidenceJson as unknown as Evidence[];
            return (
              <div key={f.id} className="rounded-lg border">
                <div className="flex flex-wrap items-center gap-2 border-b p-3">
                  <SeverityBadge severity={f.severity} />
                  <Link href={`/uploads/${id}/findings/${f.id}`} className="font-medium hover:text-primary">{f.title}</Link>
                  <span className="text-xs text-muted-foreground">· {f.category}</span>
                </div>
                <div className="space-y-2 p-3">
                  {evidence.map((e, i) => (
                    <div key={i} className="rounded-md border bg-muted/30">
                      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs">
                        <code className="text-muted-foreground">{e.filePath}{e.lineStart ? `:${e.lineStart}` : ""}</code>
                        <Link href={`/uploads/${id}/files?path=${encodeURIComponent(e.filePath)}`} className="text-primary hover:underline">Open file</Link>
                      </div>
                      <pre className="thin-scroll overflow-x-auto p-3 text-xs"><code>{redact ? redactText(e.snippet) : e.snippet}</code></pre>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
