"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { StickyNote, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AnalystNote({
  uploadId,
  findingId,
  initialNote,
}: {
  uploadId: string;
  findingId: string;
  initialNote: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/uploads/${uploadId}/findings/${findingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analystNote: note.trim() || null }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add an analyst note for this finding… (included in Internal Engineering reports)"
        className="min-h-[90px] text-sm"
      />
      <Button size="sm" variant="outline" onClick={save} disabled={busy}>
        {saved ? <><StickyNote className="h-3.5 w-3.5" /> Saved</> : <><Save className="h-3.5 w-3.5" /> {busy ? "Saving…" : "Save note"}</>}
      </Button>
    </div>
  );
}
