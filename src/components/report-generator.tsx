"use client";
import { useEffect, useState } from "react";
import { FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";

interface ReportRow {
  id: string;
  reportType: string;
  redacted: boolean;
  createdAt: string;
}

export function ReportGenerator({ uploadId }: { uploadId: string }) {
  const [type, setType] = useState<"html" | "markdown">("html");
  const [redactSerials, setRedactSerials] = useState(true);
  const [redactPrivateIps, setRedactPrivateIps] = useState(false);
  const [redactFqdns, setRedactFqdns] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
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
        reportType: type,
        redactSerials,
        redactPrivateIps,
        redactInternalFqdns: redactFqdns,
      }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setPreview(d.content);
      loadReports();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Generate report</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Format</Label>
              <div className="mt-1 flex gap-2">
                <Button variant={type === "html" ? "default" : "outline"} size="sm" onClick={() => setType("html")}>HTML</Button>
                <Button variant={type === "markdown" ? "default" : "outline"} size="sm" onClick={() => setType("markdown")}>Markdown</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Redaction</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm">Serial numbers</span>
                <Switch checked={redactSerials} onCheckedChange={setRedactSerials} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Private IPs</span>
                <Switch checked={redactPrivateIps} onCheckedChange={setRedactPrivateIps} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Internal FQDNs</span>
                <Switch checked={redactFqdns} onCheckedChange={setRedactFqdns} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Secrets (passwords, keys, tokens, certificates, emails) are always redacted.
              </p>
            </div>
            <Button className="w-full" onClick={generate} disabled={busy}>
              <FileText className="h-4 w-4" /> {busy ? "Generating…" : "Generate"}
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
                  <div className="font-medium uppercase">{r.reportType}</div>
                  <div className="text-muted-foreground">{formatDate(r.createdAt)}</div>
                </div>
                <a
                  href={`/api/reports/${r.id}?download=1`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
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
          ) : type === "html" ? (
            <iframe title="report" srcDoc={preview} className="h-[70vh] w-full rounded border bg-white" />
          ) : (
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded border bg-muted/30 p-4 text-xs">{preview}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
