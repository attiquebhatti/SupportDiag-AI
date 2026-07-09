import Link from "next/link";
import { FileText, FileDown } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadScope } from "@/lib/scope";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  const scope = uploadScope(user!);

  const reports = await prisma.report.findMany({
    where: { upload: scope },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { upload: { select: { id: true, originalFilename: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Generated troubleshooting reports across your workspace. Redaction is applied by default.</p>
      </div>

      {reports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <FileText className="h-10 w-10" />
            No reports generated yet. Open a completed case and use the Reports tab to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border p-3 card-hover">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><FileText className="h-4 w-4 text-primary" /></div>
              <div className="min-w-0 flex-1">
                <Link href={`/uploads/${r.upload.id}/report`} className="font-medium hover:text-primary">{r.upload.originalFilename}</Link>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge className="border-border bg-muted uppercase">{r.reportType}</Badge>
                  <span>{r.redacted ? "Redacted" : "Unredacted"}</span>
                  <span>· {formatDate(r.createdAt)}</span>
                </div>
              </div>
              <a href={`/api/reports/${r.id}?download=1`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent">
                <FileDown className="h-3 w-3" /> Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
