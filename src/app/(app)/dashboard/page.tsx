import Link from "next/link";
import { Upload, FileText, AlertTriangle, Activity, ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes, formatDate } from "@/lib/utils";
import { healthBand } from "@/lib/health";

export const dynamic = "force-dynamic";

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: React.ElementType; accent?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-lg p-2.5 ${accent ?? "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const scope = {
    deletedAt: null,
    OR: [
      { userId: user!.id },
      user!.organizationId ? { organizationId: user!.organizationId } : { id: "__none__" },
    ],
  };

  const [uploads, totalAnalyses, findingAgg] = await Promise.all([
    prisma.upload.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { device: true, _count: { select: { findings: true } } },
    }),
    prisma.upload.count({ where: scope }),
    prisma.finding.groupBy({
      by: ["severity"],
      _count: true,
      where: { upload: scope },
    }),
  ]);

  const critical = findingAgg.find((f) => f.severity === "CRITICAL")?._count ?? 0;
  const high = findingAgg.find((f) => f.severity === "HIGH")?._count ?? 0;

  const scored = uploads.filter((u) => u.healthScore != null);
  const avgHealth = scored.length
    ? Math.round(scored.reduce((s, u) => s + (u.healthScore ?? 0), 0) / scored.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            AI-assisted firewall support file analysis for faster troubleshooting.
          </p>
        </div>
        <Button asChild>
          <Link href="/upload">
            <Upload className="h-4 w-4" /> Upload support file
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total analyses" value={totalAnalyses} icon={FileText} />
        <StatCard label="Critical findings" value={critical} icon={ShieldAlert} accent="bg-critical/10 text-critical" />
        <StatCard label="High findings" value={high} icon={AlertTriangle} accent="bg-high/10 text-high" />
        <StatCard label="Avg health score" value={scored.length ? avgHealth : "—"} icon={Activity} accent="bg-low/10 text-low" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent uploads</CardTitle>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No support files yet.{" "}
              <Link href="/upload" className="text-primary hover:underline">
                Upload your first one
              </Link>
              .
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Findings</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((u) => {
                  const band = u.healthScore != null ? healthBand(u.healthScore) : null;
                  const href = u.status === "COMPLETED" ? `/uploads/${u.id}` : `/uploads/${u.id}/status`;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <Link href={href} className="font-medium text-primary hover:underline">
                          {u.originalFilename}
                        </Link>
                        <div className="text-xs text-muted-foreground">{formatBytes(u.fileSize)}</div>
                      </TableCell>
                      <TableCell>{u.device?.hostname ?? "—"}</TableCell>
                      <TableCell><span className="text-xs">{u.status}</span></TableCell>
                      <TableCell>{u.healthScore != null ? `${u.healthScore} · ${band?.label}` : "—"}</TableCell>
                      <TableCell>{u._count.findings}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
