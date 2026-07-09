"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

interface Evidence {
  filePath: string;
  snippet: string;
}
interface Turn {
  id: string;
  question: string;
  answer: string;
  evidence: Evidence[];
}

const DEFAULT_SUGGESTIONS = [
  "What are the top issues in this support file?",
  "Summarize the most critical findings.",
  "What should I troubleshoot first?",
];

export function AIAssistant({ uploadId, suggestions }: { uploadId: string; suggestions?: string[] }) {
  const SUGGESTIONS = suggestions && suggestions.length ? suggestions : DEFAULT_SUGGESTIONS;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/uploads/${uploadId}/ai/history`)
      .then((r) => r.json())
      .then((d) =>
        setTurns(
          (d.history ?? []).map((h: { id: string; question: string; answer: string; evidenceJson: Evidence[] }) => ({
            id: h.id,
            question: h.question,
            answer: h.answer,
            evidence: Array.isArray(h.evidenceJson) ? h.evidenceJson : [],
          }))
        )
      );
  }, [uploadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setQuestion("");
    const res = await fetch(`/api/uploads/${uploadId}/ai/question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.ok) {
      setTurns((t) => [...t, { id: d.id, question: text, answer: d.answer, evidence: d.evidence ?? [] }]);
    } else {
      setTurns((t) => [
        ...t,
        { id: crypto.randomUUID(), question: text, answer: `Error: ${d.error || "request failed"}`, evidence: [] },
      ]);
    }
  }

  return (
    <div className="flex h-[75vh] flex-col">
      <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Answers come only from your uploaded support file. Secrets are redacted before AI processing. This is not official Palo Alto Networks TAC.</span>
      </div>

      <div className="flex-1 space-y-4 overflow-auto rounded-md border p-4">
        {turns.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 text-primary" />
            <p>Ask a question about this support file.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="rounded-full bg-muted p-1.5"><User className="h-3.5 w-3.5" /></div>
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t.question}</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="rounded-full bg-primary/10 p-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /></div>
              <Card className="flex-1">
                <CardContent className="p-3">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{t.answer}</pre>
                  {t.evidence.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">Evidence ({t.evidence.length})</summary>
                      <div className="mt-2 space-y-2">
                        {t.evidence.map((e, i) => (
                          <div key={i} className="rounded border bg-muted/30 p-2 text-[11px]">
                            <code className="text-muted-foreground">{e.filePath}</code>
                            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{e.snippet}</pre>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ))}
        {busy && <p className="text-center text-xs text-muted-foreground">Analyzing evidence…</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="mt-2 flex items-end gap-2"
      >
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(question);
            }
          }}
          placeholder="Ask about HA, interfaces, licenses, commits…"
          className="min-h-[44px] flex-1 resize-none"
        />
        <Button type="submit" disabled={busy || !question.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
