"use client";
import { useEffect, useState } from "react";
import { FileDown, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn, formatDate } from "@/lib/utils";

const TEMPLATES = [
  { id: "executive", label: "Executive Summary", desc: "High-level health, top risks, priorities. No raw evidence." },
  { id: "technical", label: "Technical Troubleshooting", desc: "Full findings with evidence and remediation." },
  { id: "customer", label: "Customer-Facing", desc: "Redacted, shareable; informational items excluded." },
  { id: "internal", label: "Internal Engineering Notes", desc: "Everything, including analyst notes." },
];

interface ReportRow {
  id: string;
  reportType: string;
  format?: string;
  redacted: boolean;
  createdAt: string;
}

export function ReportGenerator({ uploadId }: { uploadId: string }) {
  const [template, setTemplate] = useState("technical");
  const [format, setFormat] = useState<"html" | "markdown">("html");
  const [redactSerials, setRedactSerials] = useState(true);
  const [redactPrivateIps, setRedactPrivateIps] = useState(false);
  const [redactFqdns, setRedactFqdns] = useState(false);
  const [includeAi, setIncludeAi] = useState(true);
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFormat, setPreviewFormat] = useState<"html" | "markdown">("html");
  const [reports, setReports] = useState<ReportRow[]>([]);

  function loadReports() {
    fetch(`/api/uploads/${uploadId}/reports`)
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []));
  }
  useEffect(loadReports, [uploadId]);

  async function generate() {
    setBusy(true);
    const res = await fetch(`/api/uploads/${uploadId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportType: template,
        format,
        redactSerials,
        redactPrivateIps,
        redactInternalFqdns: redactFqdns,
        includeAiSummary: includeAi,
        includeEvidence,
      }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setPreview(d.content);
      setPreviewFormat(format);
      loadReports();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Report template</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => setTemplate(t.id)}
                className={cn("flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                  template === t.id ? "border-primary bg-primary/5" : "hover:bg-accent")}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.desc}</div>
                </div>
                {template === t.id && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Options</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Format</Label>
              <div className="mt-1 flex gap-2">
                <Button variant={format === "html" ? "default" : "outline"} size="sm" onClick={() => setFormat("html")}>HTML</Button>
                <Button variant={format === "markdown" ? "default" : "outline"} size="sm" onClick={() => setFormat("markdown")}>Markdown</Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-sm">Include AI summary</span><Switch checked={includeAi} onCheckedChange={setIncludeAi} /></div>
              <div className="flex items-center justify-between"><span className="text-sm">Include raw evidence</span><Switch checked={includeEvidence} onCheckedChange={setIncludeEvidence} /></div>
            </div>
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">Redaction</Label>
              <div className="flex items-center justify-between"><span className="text-sm">Serial numbers</span><Switch checked={redactSerials} onCheckedChange={setRedactSerials} /></div>
              <div className="flex items-center justify-between"><span className="text-sm">Private IPs</span><Switch checked={redactPrivateIps} onCheckedChange={setRedactPrivateIps} /></div>
              <div className="flex items-center justify-between"><span className="text-sm">Internal FQDNs</span><Switch checked={redactFqdns} onCheckedChange={setRedactFqdns} /></div>
              <p className="text-[11px] text-muted-foreground">Secrets (passwords, keys, tokens, certificates, emails) are always redacted.</p>
            </div>
            <Button className="w-full" onClick={generate} disabled={busy}>
              <FileText className="h-4 w-4" /> {busy ? "Generating…" : "Generate report"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Previous reports</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {reports.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
            {reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border p-2 text-xs">
                <div>
                  <div className="font-medium capitalize">{r.reportType}{r.format ? ` · ${r.format.toUpperCase()}` : ""}</div>
                  <div className="text-muted-foreground">{formatDate(r.createdAt)}{r.redacted ? " · redacted" : ""}</div>
                </div>
                <a href={`/api/reports/${r.id}?download=1`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <FileDown className="h-3 w-3" /> Download
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
        <CardContent>
          {!preview ? (
            <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
              Generate a report to preview it here.
            </div>
          ) : previewFormat === "html" ? (
            <iframe title="report" srcDoc={preview} className="h-[70vh] w-full rounded border bg-white" />
          ) : (
            <pre className="thin-scroll max-h-[70vh] overflow-auto whitespace-pre-wrap rounded border bg-muted/30 p-4 text-xs">{preview}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
