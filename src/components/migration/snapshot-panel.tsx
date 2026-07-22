"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, PlayCircle, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SnapshotSummary {
  id: string;
  snapshotType: string;
  originalFilename: string | null;
  parseStatus: string;
  parseError: string | null;
  fileSize: number | null;
  statsJson: unknown;
}

/** The three configurations the three-way comparison needs. */
const SLOTS = [
  {
    type: "SOURCE",
    title: "Source configuration",
    hint: "The original firewall configuration, before migration.",
  },
  {
    type: "MIGRATED",
    title: "Migrated configuration",
    hint: "What the migration produced. This is the pivot both comparisons run through.",
  },
  {
    type: "TARGET_RUNNING",
    title: "Deployed target configuration",
    hint: "The running configuration actually on the device. Optional — omit for offline validation.",
  },
];

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function SnapshotPanel({
  projectId,
  snapshots,
}: {
  projectId: string;
  snapshots: SnapshotSummary[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const find = (type: string) =>
    snapshots.find((s) =>
      type === "TARGET_RUNNING"
        ? s.snapshotType.startsWith("TARGET_")
        : s.snapshotType === type
    );

  async function upload(type: string, file: File) {
    setBusy(type);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("snapshotType", type);
      const res = await fetch(`/api/migrations/${projectId}/snapshots`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (data.parsed === false) throw new Error(data.error ?? "The configuration could not be parsed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function validate() {
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`/api/migrations/${projectId}/validate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Validation failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  const canValidate = !!find("MIGRATED") && snapshots.filter((s) => s.parseStatus === "PARSED").length >= 2;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {SLOTS.map((slot) => {
          const snap = find(slot.type);
          const ok = snap?.parseStatus === "PARSED";
          const failed = snap?.parseStatus === "FAILED";
          const stats = (snap?.statsJson ?? {}) as Record<string, number | string>;

          return (
            <Card
              key={slot.type}
              className={cn(
                "transition-colors",
                ok && "border-emerald-500/40",
                failed && "border-red-500/40"
              )}
            >
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{slot.title}</p>
                  {ok && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {failed && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
                </div>

                {snap ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="truncate font-mono">{snap.originalFilename}</p>
                    <p>{formatBytes(snap.fileSize)}</p>
                    {ok && (
                      <p>
                        {stats["security-rule"] ?? 0} security · {stats["nat-rule"] ?? 0} NAT ·{" "}
                        {stats.address ?? 0} addresses
                      </p>
                    )}
                    {failed && <p className="text-red-500">{snap.parseError}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{slot.hint}</p>
                )}

                <input
                  ref={(el) => {
                    inputs.current[slot.type] = el;
                  }}
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(slot.type, f);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant={snap ? "outline" : "default"}
                  className="w-full"
                  disabled={busy === slot.type}
                  onClick={() => inputs.current[slot.type]?.click()}
                >
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  {busy === slot.type ? "Parsing…" : snap ? "Replace" : "Upload XML"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={validate} disabled={!canValidate || validating}>
          <PlayCircle className="mr-2 h-4 w-4" />
          {validating ? "Validating…" : "Run validation"}
        </Button>
        {!canValidate && (
          <p className="text-xs text-muted-foreground">
            Upload at least the source and migrated configurations to run validation.
          </p>
        )}
        {canValidate && !find("TARGET_RUNNING") && (
          <p className="text-xs text-muted-foreground">
            Offline mode: deployment and commit checks will be skipped.
          </p>
        )}
      </div>
    </div>
  );
}
