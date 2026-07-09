import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { SettingsTabs } from "@/components/settings-tabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const org = user?.organizationId
    ? await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } })
    : null;
  const [parserCount, ruleCount] = await Promise.all([
    prisma.vendorParser.count(),
    prisma.diagnosticRule.count(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, workspace, appearance, redaction, and AI preferences.</p>
      </div>
      <SettingsTabs
        data={{
          user: { name: user!.name, email: user!.email, role: user!.role },
          workspace: org?.name ?? "Default Workspace",
          limits: {
            maxUploadMb: config.limits.maxUploadMb,
            maxExtractedMb: config.limits.maxExtractedMb,
            maxExtractedFiles: config.limits.maxExtractedFiles,
          },
          retentionDays: config.retentionDays,
          storageProvider: config.storage.provider,
          ai: { enabled: config.ai.enabled, model: config.ai.model },
          parserCount,
          ruleCount,
        }}
      />
    </div>
  );
}
