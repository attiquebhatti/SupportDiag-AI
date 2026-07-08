"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { File, Search, Copy, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatBytes, cn } from "@/lib/utils";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface FileMeta {
  id: string;
  path: string;
  fileType: string | null;
  size: number;
  indexed: boolean;
}

function guessLanguage(path: string): string {
  if (path.endsWith(".xml")) return "xml";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  if (path.endsWith(".sh")) return "shell";
  return "plaintext";
}

export function FileExplorer({ uploadId, initialPath }: { uploadId: string; initialPath?: string }) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<FileMeta | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [redact, setRedact] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/uploads/${uploadId}/files`)
      .then((r) => r.json())
      .then((d) => {
        const list: FileMeta[] = d.files ?? [];
        setFiles(list);
        if (initialPath) {
          const match = list.find((f) => f.path === initialPath || f.path.endsWith(initialPath));
          if (match) setSelected(match);
        }
      });
  }, [uploadId, initialPath]);

  const loadContent = useCallback(
    async (file: FileMeta, doRedact: boolean) => {
      setLoadingContent(true);
      setNote(null);
      const res = await fetch(`/api/uploads/${uploadId}/files/${file.id}?redact=${doRedact ? "1" : "0"}`);
      const d = await res.json();
      setContent(d.file?.content ?? null);
      setNote(d.file?.binaryNote ?? null);
      setLoadingContent(false);
    },
    [uploadId]
  );

  useEffect(() => {
    if (selected) loadContent(selected, redact);
  }, [selected, redact, loadContent]);

  const filtered = useMemo(
    () => files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase())),
    [files, filter]
  );

  async function copyContent() {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* File list */}
      <div className="rounded-md border">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Filter files…" value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-8" />
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto p-1">
          {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No files.</p>}
          {filtered.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelected(f)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                selected?.id === f.id && "bg-primary/10 text-primary"
              )}
            >
              <File className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="flex-1 truncate" title={f.path}>{f.path}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatBytes(f.size)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Viewer */}
      <div className="rounded-md border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-2">
          <span className="truncate px-1 text-sm font-medium">{selected ? selected.path : "Select a file"}</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="redact" checked={redact} onCheckedChange={setRedact} />
              <Label htmlFor="redact" className="text-xs">Redact secrets</Label>
            </div>
            <button
              onClick={copyContent}
              disabled={!content}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <div className="h-[70vh]">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a file to view its contents.
            </div>
          ) : loadingContent ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : note ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">{note}</div>
          ) : (
            <MonacoEditor
              height="100%"
              language={guessLanguage(selected.path)}
              value={content ?? ""}
              theme="vs-dark"
              options={{ readOnly: true, minimap: { enabled: false }, wordWrap: "on", fontSize: 12 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
