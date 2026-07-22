"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Comparison {
  id: string;
  policyType: string;
  ruleName: string;
  sourceOrder: number | null;
  migratedOrder: number | null;
  targetOrder: number | null;
  sourceToMigrated: string;
  migratedToDeployed: string;
  endToEndStatus: string;
  riskClassification: string;
  differencesJson: unknown;
  scope: string | null;
}

interface Difference {
  field: string;
  source?: unknown;
  migrated?: unknown;
  target?: unknown;
  verdict: string;
  note?: string;
}

/** Status colouring follows the §25 legend. */
const STATUS_TONE: Record<string, string> = {
  EXACT_MATCH: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  EQUIVALENT_MATCH: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  TRANSFORMED_MATCH: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  PARTIAL_MATCH: "border-orange-500/30 bg-orange-500/10 text-orange-500",
  REQUIRES_MANUAL_REVIEW: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  MISSING_IN_MIGRATED: "border-red-500/30 bg-red-500/10 text-red-500",
  MISSING_IN_TARGET: "border-red-500/30 bg-red-500/10 text-red-500",
  EXTRA_IN_TARGET: "border-orange-500/30 bg-orange-500/10 text-orange-500",
  CONFLICT: "border-red-500/30 bg-red-500/10 text-red-500",
  NOT_EVALUATED: "border-muted-foreground/20 bg-muted text-muted-foreground",
};

function short(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

function render(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ComparisonTable({ comparisons }: { comparisons: Comparison[] }) {
  const types = useMemo(
    () => [...new Set(comparisons.map((c) => c.policyType))].sort(),
    [comparisons]
  );
  const [type, setType] = useState<string>(types[0] ?? "");
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = comparisons
    .filter((c) => c.policyType === type)
    .filter((c) => !onlyDiff || c.endToEndStatus !== "EXACT_MATCH");

  if (!comparisons.length) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Three-way comparison</p>
            <p className="text-xs text-muted-foreground">
              Source → Migrated → Deployed, compared field by field.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyDiff}
              onChange={(e) => setOnlyDiff(e.target.checked)}
            />
            Differences only
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                t === type
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:text-foreground"
              )}
            >
              {t} ({comparisons.filter((c) => c.policyType === t).length})
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Entity</th>
                <th className="pb-2 pr-3 font-medium">Source → Migrated</th>
                <th className="pb-2 pr-3 font-medium">Migrated → Deployed</th>
                <th className="pb-2 pr-3 font-medium">Order</th>
                <th className="pb-2 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const payload = (c.differencesJson ?? {}) as {
                  differences?: Difference[];
                  notes?: string[];
                };
                const diffs = payload.differences ?? [];
                const open = expanded === c.id;

                return (
                  <>
                    <tr
                      key={c.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                      onClick={() => setExpanded(open ? null : c.id)}
                    >
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <ChevronRight
                            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
                          />
                          <span className="font-medium">{c.ruleName}</span>
                        </div>
                        {c.scope && (
                          <span className="ml-5 text-xs text-muted-foreground">{c.scope}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Tone status={c.sourceToMigrated} />
                      </td>
                      <td className="py-2 pr-3">
                        <Tone status={c.migratedToDeployed} />
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                        {c.sourceOrder ?? "—"} → {c.migratedOrder ?? "—"} → {c.targetOrder ?? "—"}
                      </td>
                      <td className="py-2 text-xs">{short(c.riskClassification)}</td>
                    </tr>

                    {open && (
                      <tr key={`${c.id}-detail`} className="border-b bg-muted/20 last:border-0">
                        <td colSpan={5} className="px-5 py-3">
                          {payload.notes?.length ? (
                            <p className="mb-2 text-xs text-muted-foreground">
                              {payload.notes.join(" · ")}
                            </p>
                          ) : null}
                          {diffs.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No field differences recorded.
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="pb-1 pr-3 font-medium">Field</th>
                                  <th className="pb-1 pr-3 font-medium">Source</th>
                                  <th className="pb-1 pr-3 font-medium">Migrated</th>
                                  <th className="pb-1 pr-3 font-medium">Deployed</th>
                                  <th className="pb-1 font-medium">Verdict</th>
                                </tr>
                              </thead>
                              <tbody>
                                {diffs.map((d, i) => (
                                  <tr key={`${d.field}-${i}`} className="align-top">
                                    <td className="py-1 pr-3 font-mono">{d.field}</td>
                                    <td className="py-1 pr-3">{render(d.source)}</td>
                                    <td className="py-1 pr-3">{render(d.migrated)}</td>
                                    <td className="py-1 pr-3">{render(d.target)}</td>
                                    <td className="py-1">
                                      <span
                                        className={cn(
                                          "rounded px-1.5 py-0.5",
                                          d.verdict === "broadened" || d.verdict === "lost"
                                            ? "bg-red-500/10 text-red-500"
                                            : d.verdict === "narrowed"
                                              ? "bg-orange-500/10 text-orange-500"
                                              : "bg-amber-500/10 text-amber-500"
                                        )}
                                      >
                                        {d.verdict}
                                      </span>
                                      {d.note && (
                                        <span className="ml-1.5 text-muted-foreground">{d.note}</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No differences in this rulebase.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Tone({ status }: { status: string }) {
  return (
    <Badge className={cn("text-[10px]", STATUS_TONE[status] ?? STATUS_TONE.NOT_EVALUATED)}>
      {short(status)}
    </Badge>
  );
}
