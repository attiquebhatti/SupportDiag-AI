import { getCurrentUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent>
          <KV k="Name" v={user?.name} />
          <KV k="Email" v={user?.email} />
          <KV k="Role" v={<Badge className="border-primary/30 bg-primary/10 text-primary">{user?.role}</Badge>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Limits & retention</CardTitle></CardHeader>
        <CardContent>
          <KV k="Max upload size" v={`${config.limits.maxUploadMb} MB`} />
          <KV k="Max extracted size" v={`${config.limits.maxExtractedMb} MB`} />
          <KV k="Max extracted files" v={config.limits.maxExtractedFiles.toLocaleString()} />
          <KV k="Retention" v={`${config.retentionDays} days`} />
          <KV k="Storage provider" v={config.storage.provider} />
          <KV
            k="AI analysis"
            v={
              config.ai.enabled ? (
                <Badge className="border-low/30 bg-low/10 text-low">Enabled · {config.ai.model}</Badge>
              ) : (
                <Badge className="border-info/30 bg-info/10 text-info">Disabled</Badge>
              )
            }
          />
          <p className="mt-3 text-xs text-muted-foreground">
            These values are configured via environment variables on the server and shown here for reference.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Privacy & data deletion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Uploaded support files are stored in your configured object storage and processed on the
            server. Only text-based files are indexed; uploaded files are never executed.
          </p>
          <p className="flex items-start gap-2">
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
            You can delete any case from its page. Deletion purges the original archive from storage and
            removes all extracted content, findings, AI conversations, and reports. A scheduled cleanup
            job also removes files older than the {config.retentionDays}-day retention window.
          </p>
          <p>
            Secrets — passwords, API keys, tokens, private keys, certificates, pre-shared keys, and
            email addresses — are redacted before any AI processing and, by default, in exported
            reports. Public IPs are redacted by default; private IPs and internal FQDNs can be
            optionally redacted.
          </p>
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
            FirewallLens AI is an independent diagnostic assistant. It is not an official Palo Alto
            Networks tool and does not replace Palo Alto Networks TAC.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
