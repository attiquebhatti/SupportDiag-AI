import { redirect } from "next/navigation";
import { CheckCircle2, XCircle, AlertTriangle, HeartPulse } from "lucide-react";
import { getCurrentUser, canAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { ensureStorageDirs } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

function StatusRow({ label, ok, detail, warn = false }: { label: string; ok: boolean; detail?: string; warn?: boolean }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const color = ok ? "text-emerald-500" : warn ? "text-amber-500" : "text-red-500";
  return (
    <div className="flex items-center justify-between border-b py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1.5 font-medium ${color}`}>
        <Icon className="h-4 w-4" />
        {detail ?? (ok ? "OK" : warn ? "Not configured" : "Failed")}
      </span>
    </div>
  );
}

export default async function HealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAdmin(user.role)) redirect("/dashboard");

  // Database connectivity
  let dbOk = false;
  let dbDetail = "Unreachable";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    dbDetail = "Connected (MySQL)";
  } catch (e) {
    dbDetail = e instanceof Error ? e.message.slice(0, 60) : "Unreachable";
  }

  // Storage directories (created if missing, then write-tested)
  const dirs = config.storage.driver === "local" ? await ensureStorageDirs() : [];

  // Cron heartbeats
  const [lastProcess, lastCleanup] = await Promise.all([
    prisma.systemState.findUnique({ where: { key: "last-cron-process" } }).catch(() => null),
    prisma.systemState.findUnique({ where: { key: "last-cron-cleanup" } }).catch(() => null),
  ]);

  const aiConfigured = config.ai.enabled && !!config.ai.apiKey;
  const cronConfigured = !!config.cron.secret;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <HeartPulse className="h-6 w-6 text-primary" /> System Health
        </h1>
        <p className="text-sm text-muted-foreground">
          Deployment health for Hostinger setup. Admin only.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Core services</CardTitle></CardHeader>
        <CardContent>
          <StatusRow label="Database" ok={dbOk} detail={dbDetail} />
          <StatusRow
            label={`Storage driver`}
            ok
            detail={config.storage.driver}
          />
          {dirs.map((d) => (
            <StatusRow key={d.dir} label={`Directory ${d.dir}`} ok={d.writable} detail={d.writable ? "Writable" : "Not writable"} />
          ))}
          <StatusRow label="AI (OpenAI-compatible)" ok={aiConfigured} warn={!aiConfigured} detail={aiConfigured ? `Enabled · ${config.ai.model}` : "Disabled / no key"} />
          <StatusRow label="CRON_SECRET" ok={cronConfigured} warn={!cronConfigured} detail={cronConfigured ? "Configured" : "Missing"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Background processing</CardTitle></CardHeader>
        <CardContent>
          <StatusRow
            label="Last process-pending-jobs run"
            ok={!!lastProcess}
            warn={!lastProcess}
            detail={lastProcess ? formatDate(lastProcess.value) : "Never (configure the Hostinger cron job)"}
          />
          <StatusRow
            label="Last cleanup-expired-files run"
            ok={!!lastCleanup}
            warn={!lastCleanup}
            detail={lastCleanup ? formatDate(lastCleanup.value) : "Never (configure the Hostinger cron job)"}
          />
          <StatusRow label="Jobs per cron tick" ok detail={String(config.cron.batchSize)} />
          <StatusRow label="Retention" ok detail={`${config.retentionDays} days`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Application</CardTitle></CardHeader>
        <CardContent>
          <StatusRow label="App version" ok detail={`v${pkg.version}`} />
          <StatusRow label="Max upload" ok detail={`${config.limits.maxUploadMb} MB`} />
          <StatusRow label="Max extracted" ok detail={`${config.limits.maxExtractedMb} MB`} />
          <StatusRow label="Max extracted files" ok detail={config.limits.maxExtractedFiles.toLocaleString()} />
        </CardContent>
      </Card>
    </div>
  );
}
