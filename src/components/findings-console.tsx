"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SeverityBadge } from "@/components/severity-badge";
import { VendorBadge, ProductBadge } from "@/components/badges";
import { Icon } from "@/components/icon";
import { CATEGORY_ICONS } from "@/lib/vendors";
import { formatDate } from "@/lib/utils";

export interface FindingRow {
  id: string;
  uploadId: string;
  caseName: string;
  severity: string;
  vendor: string | null;
  product: string | null;
  category: string;
  title: string;
  impact: string;
  confidence: number;
  status: string;
  evidenceCount: number;
  recommendation: string;
  createdAt: string;
}

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };
const STATUS_LABEL: Record<string, string> = { OPEN: "Open", VALID: "Valid", FALSE_POSITIVE: "False Positive", NEEDS_REVIEW: "Needs Review" };

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function FindingsConsole({ rows }: { rows: FindingRow[] }) {
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("severity");

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);
  const vendors = useMemo(() => Array.from(new Set(rows.map((r) => r.vendor).filter(Boolean))) as string[], [rows]);

  const filtered = useMemo(() => {
    let list = rows.filter((r) =>
      (!severity || r.severity === severity) &&
      (!vendor || r.vendor === vendor) &&
      (!category || r.category === category) &&
      (!status || r.status === status) &&
      (!q || `${r.title} ${r.impact} ${r.caseName}`.toLowerCase().includes(q.toLowerCase()))
    );
    list = [...list].sort((a, b) =>
      sort === "confidence" ? b.confidence - a.confidence
      : sort === "time" ? +new Date(b.createdAt) - +new Date(a.createdAt)
      : SEV_ORDER[a.severity] - SEV_ORDER[b.severity]
    );
    return list;
  }, [rows, q, severity, vendor, category, status, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search findings…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <Select value={severity} onChange={setSeverity} placeholder="All severities" options={[["CRITICAL","Critical"],["HIGH","High"],["MEDIUM","Medium"],["LOW","Low"],["INFORMATIONAL","Informational"]].map(([value,label]) => ({ value, label }))} />
        <Select value={vendor} onChange={setVendor} placeholder="All vendors" options={vendors.map((v) => ({ value: v, label: v }))} />
        <Select value={category} onChange={setCategory} placeholder="All categories" options={categories.map((c) => ({ value: c, label: c }))} />
        <Select value={status} onChange={setStatus} placeholder="All statuses" options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select value={sort} onChange={setSort} placeholder="Sort" options={[{ value: "severity", label: "Sort: Severity" }, { value: "confidence", label: "Sort: Confidence" }, { value: "time", label: "Sort: Newest" }]} />
        <span className="text-xs text-muted-foreground">{filtered.length} finding(s)</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          <ShieldAlert className="h-8 w-8" /> No findings match your filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <Link key={f.id} href={`/uploads/${f.uploadId}/findings/${f.id}`}
              className="flex items-start gap-3 rounded-lg border p-3 card-hover">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon name={CATEGORY_ICONS[f.category] ?? "AlertTriangle"} className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={f.severity} />
                  <span className="font-medium">{f.title}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{f.impact}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <VendorBadge vendor={f.vendor} />
                  <ProductBadge product={f.product} />
                  <span>· {f.category}</span>
                  <span>· {f.evidenceCount} evidence</span>
                  <span>· {f.confidence}% confidence</span>
                  <span>· {STATUS_LABEL[f.status] ?? f.status}</span>
                  <span className="ml-auto">{f.caseName}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
