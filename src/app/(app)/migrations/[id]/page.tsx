import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBand, ScoreRow } from "@/components/migration/score-band";
import { SnapshotPanel } from "@/components/migration/snapshot-panel";
import { ComparisonTable } from "@/components/migration/comparison-table";
import { FindingsList } from "@/components/migration/findings-list";
import type { ScoreBreakdown } from "@/lib/migration/scoring";
import type { Completeness } from "@/lib/migration/scoring";

export const dynamic = "force-dynamic";

const MGMT_LABEL: Record<string, string> = {
  STANDALONE_PANOS: "Standalone PAN-OS",
  PANORAMA: "Panorama",
  SCM: "Strata Cloud Manager",
  PRISMA_ACCESS: "Prisma Access",
};

export default async function MigrationProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const project = await prisma.migrationProject.findUnique({
    where: { id },
    include: { snapshots: { orderBy: { collectedAt: "desc" } } },
  });
  // Per-user isolation, consistent with case access.
  if (!project || project.deletedAt || project.userId !== user?.id) notFound();

  const [comparisons, findings] = await Promise.all([
    prisma.policyComparison.findMany({
      where: { migrationProjectId: id },
      orderBy: [{ policyType: "asc" }, { migratedOrder: "asc" }],
      take: 500,
    }),
    prisma.validationFinding.findMany({
      where: { migrationProjectId: id },
      orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
      take: 300,
    }),
  ]);

  const scores = project.scoresJson as unknown as ScoreBreakdown | null;
  const completeness = project.completenessJson as unknown as Completeness | null;

  // Parity findings are kept separate from optimization advice (§22).
  const parityFindings = findings.filter(
    (f) => f.category !== "OPTIMIZATION_RECOMMENDATION"
  );
  const optimizationFindings = findings.filter(
    (f) => f.category === "OPTIMIZATION_RECOMMENDATION"
  );

  const counts = {
    source: comparisons.filter((c) => c.sourceToMigrated !== "NOT_EVALUATED").length,
    missing: comparisons.filter((c) => c.endToEndStatus === "MISSING_IN_MIGRATED").length,
    notDeployed: comparisons.filter((c) => c.endToEndStatus === "MISSING_IN_TARGET").length,
    extra: comparisons.filter((c) => c.endToEndStatus === "EXTRA_IN_TARGET").length,
    regressions: findings.filter((f) => f.category === "SECURITY_REGRESSION").length,
    connectivity: findings.filter((f) => f.category === "CONNECTIVITY_RISK").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/migrations" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{project.name}</h1>
          <p className="text-xs text-muted-foreground">
            {project.sourceVendor ? `${project.sourceVendor} → ` : ""}
            {MGMT_LABEL[project.targetManagementType] ?? project.targetManagementType}
            {project.lastValidatedAt &&
              ` · validated ${new Date(project.lastValidatedAt).toLocaleString()}`}
          </p>
        </div>
        {scores && <ScoreBand score={scores.overall} band={scores.band} />}
      </div>

      <SnapshotPanel projectId={project.id} snapshots={project.snapshots} />

      {scores && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Compared" value={counts.source} />
            <Stat label="Not migrated" value={counts.missing} tone={counts.missing ? "bad" : undefined} />
            <Stat
              label="Not deployed"
              value={counts.notDeployed}
              tone={counts.notDeployed ? "bad" : undefined}
            />
            <Stat label="Extra on target" value={counts.extra} tone={counts.extra ? "warn" : undefined} />
            <Stat
              label="Security regressions"
              value={counts.regressions}
              tone={counts.regressions ? "bad" : undefined}
            />
            <Stat
              label="Connectivity risks"
              value={counts.connectivity}
              tone={counts.connectivity ? "warn" : undefined}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="space-y-3 pt-6">
                <p className="text-sm font-medium">Assurance scores</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ScoreRow label="Security policy parity" value={scores.securityPolicyParity} />
                  <ScoreRow label="NAT policy parity" value={scores.natPolicyParity} />
                  <ScoreRow label="Object parity" value={scores.objectParity} />
                  <ScoreRow label="Dependency integrity" value={scores.dependencyIntegrity} />
                  <ScoreRow label="Rule order integrity" value={scores.ruleOrderIntegrity} />
                  <ScoreRow label="Security regression" value={scores.securityRegression} />
                  <ScoreRow label="Decryption parity" value={scores.decryptionPolicyParity} />
                  <ScoreRow label="Deployment verification" value={scores.deploymentVerification} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="text-sm font-medium">Verification completeness</p>
                <p className="text-xs text-muted-foreground">
                  Scores must be read against what was actually checked.
                </p>
                <ul className="space-y-1.5 pt-1 text-xs">
                  <Check ok={completeness?.sourceProvided}>Source provided</Check>
                  <Check ok={completeness?.migratedProvided}>Migrated output provided</Check>
                  <Check ok={completeness?.targetRetrieved}>Target configuration retrieved</Check>
                  <Check ok={completeness?.commitValidated}>Commit validated</Check>
                  <Check ok={completeness?.deploymentVerified}>Deployment verified</Check>
                  <Check ok={completeness?.policyTestsCompleted}>Policy tests completed</Check>
                  <Check ok={completeness?.runtimeChecksCompleted}>Runtime checks completed</Check>
                </ul>
              </CardContent>
            </Card>
          </div>

          <FindingsList
            title="Migration findings"
            subtitle="Parity, deployment, and regression issues. Optimization advice is listed separately."
            findings={parityFindings}
          />

          <ComparisonTable comparisons={comparisons} />

          {optimizationFindings.length > 0 && (
            <FindingsList
              title="Optimization recommendations"
              subtitle="Best-practice improvements. These are not migration failures — a faithfully migrated rule is not wrong merely because it could be tightened."
              findings={optimizationFindings}
            />
          )}
        </>
      )}

      {!scores && project.snapshots.length > 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Configurations uploaded. Run validation to produce the assurance report.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "bad" | "warn";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p
          className={
            tone === "bad"
              ? "text-2xl font-semibold text-red-500"
              : tone === "warn"
                ? "text-2xl font-semibold text-amber-500"
                : "text-2xl font-semibold"
          }
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function Check({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <Badge
        className={
          ok
            ? "h-4 border-emerald-500/30 bg-emerald-500/10 px-1 text-[10px] text-emerald-500"
            : "h-4 border-dashed px-1 text-[10px] text-muted-foreground"
        }
      >
        {ok ? "yes" : "no"}
      </Badge>
      <span className={ok ? "" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}
