"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Finding {
  id: string;
  category: string;
  severity: string;
  findingType: string;
  title: string;
  description: string;
  entityType: string | null;
  entityName: string | null;
  impact: string | null;
  recommendation: string | null;
  sourceEvidenceJson: unknown;
  migratedEvidenceJson: unknown;
  targetEvidenceJson: unknown;
}

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: "border-red-500/30 bg-red-500/10 text-red-500",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-500",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  LOW: "border-sky-500/30 bg-sky-500/10 text-sky-500",
  INFORMATIONAL: "border-muted-foreground/20 bg-muted text-muted-foreground",
};

const CATEGORY_LABEL: Record<string, string> = {
  MIGRATION_FAILURE: "Migration failure",
  MIGRATION_DIFFERENCE: "Migration difference",
  DEPLOYMENT_FAILURE: "Deployment failure",
  SECURITY_REGRESSION: "Security regression",
  CONNECTIVITY_RISK: "Connectivity risk",
  OPTIMIZATION_RECOMMENDATION: "Optimization",
};

export function FindingsList({
  title,
  subtitle,
  findings,
}: {
  title: string;
  subtitle?: string;
  findings: Finding[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");

  const categories = [...new Set(findings.map((f) => f.category))];
  const rows = category === "all" ? findings : findings.filter((f) => f.category === category);

  if (!findings.length) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <p className="text-sm font-medium">
            {title} <span className="text-muted-foreground">({findings.length})</span>
          </p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {["all", ...categories].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  c === category
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:text-foreground"
                )}
              >
                {c === "all" ? "All" : (CATEGORY_LABEL[c] ?? c)}
              </button>
            ))}
          </div>
        )}

        <ul className="divide-y">
          {rows.map((f) => {
            const isOpen = open === f.id;
            return (
              <li key={f.id} className="py-2">
                <button
                  onClick={() => setOpen(isOpen ? null : f.id)}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <ChevronRight
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform",
                      isOpen && "rotate-90"
                    )}
                  />
                  <Badge className={cn("shrink-0 text-[10px]", SEVERITY_TONE[f.severity])}>
                    {f.severity.toLowerCase()}
                  </Badge>
                  <span className="min-w-0 flex-1 text-sm">{f.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {CATEGORY_LABEL[f.category] ?? f.category}
                  </span>
                </button>

                {isOpen && (
                  <div className="ml-6 mt-2 space-y-2 text-xs">
                    <p className="text-muted-foreground">{f.description}</p>
                    {f.impact && (
                      <p>
                        <span className="font-medium">Impact: </span>
                        <span className="text-muted-foreground">{f.impact}</span>
                      </p>
                    )}
                    {f.recommendation && (
                      <p>
                        <span className="font-medium">Recommendation: </span>
                        <span className="text-muted-foreground">{f.recommendation}</span>
                      </p>
                    )}
                    <Evidence
                      source={f.sourceEvidenceJson}
                      migrated={f.migratedEvidenceJson}
                      target={f.targetEvidenceJson}
                    />
                    <p className="font-mono text-[10px] text-muted-foreground">{f.findingType}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Every finding cites the configuration it came from (§35). */
function Evidence({
  source,
  migrated,
  target,
}: {
  source: unknown;
  migrated: unknown;
  target: unknown;
}) {
  const items = [
    { label: "Source", value: source },
    { label: "Migrated", value: migrated },
    { label: "Deployed", value: target },
  ].filter((i) => i.value != null);

  if (!items.length) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="rounded border bg-muted/30 p-2">
          <p className="mb-1 font-medium">{i.label}</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
            {JSON.stringify(i.value, null, 1)}
          </pre>
        </div>
      ))}
    </div>
  );
}
