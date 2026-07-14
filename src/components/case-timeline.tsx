"use client";
import { useMemo, useState } from "react";
import { Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TimelineEvent {
  time: string | null;
  category: string;
  severity: "Critical" | "High" | "Medium" | "Low" | "Info";
  source: string;
  text: string;
  lowPrecision?: boolean;
}

const SEV_DOT: Record<string, string> = {
  Critical: "bg-red-500", High: "bg-orange-500", Medium: "bg-amber-500", Low: "bg-blue-500", Info: "bg-slate-400",
};

export function CaseTimeline({ events }: { events: TimelineEvent[] }) {
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");

  const sources = useMemo(() => Array.from(new Set(events.map((e) => e.source))).sort(), [events]);
  const filtered = useMemo(
    () => events.filter((e) =>
      (!severity || e.severity === severity) &&
      (!source || e.source === source) &&
      (!q || e.text.toLowerCase().includes(q.toLowerCase()))),
    [events, q, severity, source]
  );

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        <Clock className="h-8 w-8" /> No timestamped events were extracted from this bundle.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All severities</option>
          {["Critical","High","Medium","Low","Info"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} event(s)</span>
      </div>

      <div className="relative space-y-1 border-l pl-5">
        {filtered.map((e, i) => (
          <div key={i} className="relative pb-3">
            <span className={cn("absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background", SEV_DOT[e.severity])} />
            <div className="rounded-md border p-2.5">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono">{e.time ?? "no timestamp"}</span>
                {e.lowPrecision && (
                  <span title="Low-precision or placeholder timestamp" className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-500">
                    low precision
                  </span>
                )}
                <span>· {e.category}</span>
                <span className="ml-auto font-mono">{e.source}</span>
              </div>
              <p className="mt-1 break-words font-mono text-xs">{e.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
