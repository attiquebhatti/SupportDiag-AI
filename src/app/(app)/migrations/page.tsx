import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CreateMigrationProject } from "@/components/migration/create-project-form";
import { ScoreBand } from "@/components/migration/score-band";

export const dynamic = "force-dynamic";

/** Filled when the configuration has been supplied and parsed. */
function SnapshotBadge({ present, children }: { present: boolean; children: React.ReactNode }) {
  return (
    <Badge
      className={cn(
        present
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
          : "border-dashed text-muted-foreground"
      )}
    >
      {children}
    </Badge>
  );
}

const MGMT_LABEL: Record<string, string> = {
  STANDALONE_PANOS: "Standalone PAN-OS",
  PANORAMA: "Panorama",
  SCM: "Strata Cloud Manager",
  PRISMA_ACCESS: "Prisma Access",
};

export default async function MigrationsPage() {
  const user = await getCurrentUser();

  const projects = await prisma.migrationProject.findMany({
    where: { userId: user!.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      snapshots: { select: { snapshotType: true, parseStatus: true } },
      _count: { select: { findings: true, comparisons: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Migration Assurance</h1>
          <p className="text-sm text-muted-foreground">
            Verify that migrated firewall policies, objects, and behavior match the intended
            source configuration.
          </p>
        </div>
        <CreateMigrationProject />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <GitCompareArrows className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No migration projects yet</p>
              <p className="text-sm text-muted-foreground">
                Create a project, then upload the source configuration, the migration output,
                and the deployed target configuration to validate them against each other.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const scores = p.scoresJson as { overall?: number; band?: string } | null;
            const has = (t: string) =>
              p.snapshots.some((s) => s.snapshotType === t && s.parseStatus === "PARSED");
            const hasTarget =
              has("TARGET_RUNNING") || has("TARGET_CANDIDATE") || has("TARGET_EFFECTIVE");

            return (
              <Link key={p.id} href={`/migrations/${p.id}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.sourceVendor ? `${p.sourceVendor} → ` : ""}
                          {MGMT_LABEL[p.targetManagementType] ?? p.targetManagementType}
                        </p>
                      </div>
                      {scores?.overall !== undefined && (
                        <ScoreBand score={scores.overall} band={scores.band} compact />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <SnapshotBadge present={has("SOURCE")}>Source</SnapshotBadge>
                      <SnapshotBadge present={has("MIGRATED")}>Migrated</SnapshotBadge>
                      <SnapshotBadge present={hasTarget}>Target</SnapshotBadge>
                    </div>

                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{p._count.comparisons} compared</span>
                      <span>{p._count.findings} findings</span>
                      <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
