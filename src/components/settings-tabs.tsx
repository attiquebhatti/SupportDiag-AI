"use client";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

interface SettingsData {
  user: { name: string; email: string; role: string };
  workspace: string;
  limits: { maxUploadMb: number; maxExtractedMb: number; maxExtractedFiles: number };
  retentionDays: number;
  storageProvider: string;
  ai: { enabled: boolean; model: string };
  parserCount: number;
  ruleCount: number;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function ToggleRow({ label, note, defaultChecked = false, disabled = false }: { label: string; note?: string; defaultChecked?: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between border-b py-2.5 last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </div>
      <Switch checked={on} onCheckedChange={setOn} disabled={disabled} />
    </div>
  );
}

export function SettingsTabs({ data }: { data: SettingsData }) {
  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList className="flex h-auto flex-wrap justify-start gap-1">
        {["profile","organization","appearance","limits","redaction","ai","parsers","reports"].map((t) => (
          <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="profile">
        <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent>
          <Row k="Name" v={data.user.name} />
          <Row k="Email" v={data.user.email} />
          <Row k="Role" v={<Badge className="border-primary/30 bg-primary/10 text-primary">{data.user.role}</Badge>} />
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="organization">
        <Card><CardHeader><CardTitle>Organization</CardTitle></CardHeader><CardContent>
          <Row k="Workspace" v={data.workspace} />
          <Row k="Storage provider" v={data.storageProvider} />
          <Row k="Data retention" v={`${data.retentionDays} days`} />
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="appearance">
        <Card><CardHeader><CardTitle>Appearance</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div><div className="text-sm font-medium">Theme</div><div className="text-xs text-muted-foreground">Light, dark, or system default</div></div>
            <ThemeToggle />
          </div>
          <ToggleRow label="Compact layout" note="Denser spacing in tables and cards" />
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="limits">
        <Card><CardHeader><CardTitle>Upload limits & retention</CardTitle></CardHeader><CardContent>
          <Row k="Max upload size" v={`${data.limits.maxUploadMb} MB`} />
          <Row k="Max extracted size" v={`${data.limits.maxExtractedMb} MB`} />
          <Row k="Max extracted files" v={data.limits.maxExtractedFiles.toLocaleString()} />
          <Row k="Retention" v={`${data.retentionDays} days`} />
          <p className="pt-3 text-xs text-muted-foreground">Configured via server environment variables.</p>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="redaction">
        <Card><CardHeader><CardTitle>Redaction policy</CardTitle></CardHeader><CardContent>
          <ToggleRow label="Redact secrets" note="Passwords, keys, tokens, certificates" defaultChecked disabled />
          <ToggleRow label="Redact serial numbers" defaultChecked />
          <ToggleRow label="Redact IP addresses" note="Public IPs always redacted; toggle private IPs" />
          <ToggleRow label="Redact usernames" />
          <ToggleRow label="Redact domains / FQDNs" />
          <ToggleRow label="Redact certificates" defaultChecked disabled />
          <p className="pt-3 text-xs text-muted-foreground">Secrets are always redacted before AI processing. Per-workspace policy persistence is coming soon.</p>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="ai">
        <Card><CardHeader><CardTitle>AI settings</CardTitle></CardHeader><CardContent>
          <Row k="AI analysis" v={data.ai.enabled ? <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">Enabled</Badge> : <Badge className="border-slate-500/30 bg-slate-500/10 text-slate-400">Disabled</Badge>} />
          <Row k="Model" v={data.ai.model} />
          <ToggleRow label="Evidence-only mode" note="AI answers only from extracted evidence" defaultChecked disabled />
          <ToggleRow label="Redact before AI" note="Redact secrets before sending to the model" defaultChecked disabled />
          <Row k="Max evidence chunks" v="6" />
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="parsers">
        <Card><CardHeader><CardTitle>Parser & rule settings</CardTitle></CardHeader><CardContent>
          <Row k="Registered parsers" v={data.parserCount} />
          <Row k="Diagnostic rules" v={data.ruleCount} />
          <p className="pt-3 text-xs text-muted-foreground">Manage individual parser/rule enablement on the Vendor Parsers page.</p>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="reports">
        <Card><CardHeader><CardTitle>Report branding</CardTitle></CardHeader><CardContent className="space-y-3">
          <ToggleRow label="Include workspace name" defaultChecked />
          <ToggleRow label="Include independent-tool disclaimer" note="Required — this platform is not an official vendor tool" defaultChecked disabled />
          <p className="text-xs text-muted-foreground">API keys and integrations will appear here in a future release.</p>
        </CardContent></Card>
      </TabsContent>
    </Tabs>
  );
}
