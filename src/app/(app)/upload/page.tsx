"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileArchive, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";

const ACCEPTED = [".tgz", ".tar.gz", ".tar", ".zip"];

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>("");

  function pick(f: File | null) {
    setError(null);
    if (!f) return;
    const ok = ACCEPTED.some((ext) => f.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setError(`Unsupported file type. Allowed: ${ACCEPTED.join(", ")}`);
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPhase("Uploading archive…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Upload failed");
      setBusy(false);
      return;
    }
    const { upload } = await res.json();

    setPhase("Starting analysis…");
    // Kick off processing immediately; cron is the fallback if this times out.
    fetch(`/api/uploads/${upload.id}/process`, { method: "POST" }).catch(() => {});
    router.push(`/uploads/${upload.id}/status`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload support file</h1>
        <p className="text-sm text-muted-foreground">
          Upload a PAN-OS tech support file. It is stored securely, extracted safely, and never executed.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0] ?? null);
            }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input px-6 py-12 text-center transition-colors hover:border-primary/50"
          >
            <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Drag & drop or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Supported: {ACCEPTED.join(", ")} · Max 100 MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".tgz,.tar.gz,.tar,.zip"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </div>

          {file && (
            <div className="mt-4 flex items-center gap-3 rounded-md border bg-muted/30 p-3">
              <FileArchive className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)} disabled={busy}>
                Remove
              </Button>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          <Button className="mt-4 w-full" onClick={submit} disabled={!file || busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {phase}
              </>
            ) : (
              "Upload & analyze"
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Secrets (passwords, keys, tokens, certificates) are redacted before any AI processing and,
          by default, in reports. You can delete a case at any time to purge its stored archive and
          extracted content. This is an independent tool and does not replace Palo Alto Networks TAC.
        </p>
      </div>
    </div>
  );
}
