"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteCaseButton({ uploadId }: { uploadId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function del() {
    setBusy(true);
    const res = await fetch(`/api/uploads/${uploadId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  if (!confirm) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
        <Trash2 className="h-4 w-4" /> Delete case
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Purge archive & extracted data?</span>
      <Button variant="destructive" size="sm" onClick={del} disabled={busy}>
        {busy ? "Deleting…" : "Confirm"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}
