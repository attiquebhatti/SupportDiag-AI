"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Result {
  fileId: string;
  path: string;
  line: number;
  text: string;
}

function highlight(text: string, q: string, regex: boolean): React.ReactNode {
  if (!q) return text;
  try {
    const re = regex ? new RegExp(`(${q})`, "ig") : new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) ? <mark key={i} className="bg-yellow-300/60 dark:bg-yellow-500/40">{p}</mark> : <span key={i}>{p}</span>
    );
  } catch {
    return text;
  }
}

export function GlobalSearch({ uploadId }: { uploadId: string }) {
  const [q, setQ] = useState("");
  const [regex, setRegex] = useState(false);
  const [pathFilter, setPathFilter] = useState("");
  const [redact, setRedact] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const [meta, setMeta] = useState<{ count: number; truncated: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    const url = new URL(`/api/uploads/${uploadId}/search`, window.location.origin);
    url.searchParams.set("q", q);
    if (regex) url.searchParams.set("regex", "1");
    if (pathFilter) url.searchParams.set("path", pathFilter);
    url.searchParams.set("redact", redact ? "1" : "0");
    const res = await fetch(url);
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Search failed");
      return;
    }
    const d = await res.json();
    setResults(d.results ?? []);
    setMeta({ count: d.count, truncated: d.truncated });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search across extracted files…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Input placeholder="Filter by file path (optional)" value={pathFilter} onChange={(e) => setPathFilter(e.target.value)} className="max-w-xs" />
          <div className="flex items-center gap-2">
            <Switch id="regex" checked={regex} onCheckedChange={setRegex} />
            <Label htmlFor="regex" className="text-xs">Regex</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="redact-search" checked={redact} onCheckedChange={setRedact} />
            <Label htmlFor="redact-search" className="text-xs">Redact secrets</Label>
          </div>
        </div>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {meta && (
        <p className="text-xs text-muted-foreground">
          {meta.count} match(es){meta.truncated ? " (truncated at 300)" : ""}
        </p>
      )}

      <div className="space-y-1">
        {results.map((r, i) => (
          <div key={i} className="rounded-md border p-2 text-xs">
            <div className="mb-1 flex items-center justify-between">
              <Link
                href={`/uploads/${uploadId}/files?path=${encodeURIComponent(r.path)}`}
                className="font-mono text-primary hover:underline"
              >
                {r.path}:{r.line}
              </Link>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
              {highlight(r.text, q, regex)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
