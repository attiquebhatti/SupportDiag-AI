"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { value: "VALID", label: "Valid" },
  { value: "FALSE_POSITIVE", label: "False Positive" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
];

export function FindingStatusControl({
  uploadId,
  findingId,
  current,
}: {
  uploadId: string;
  findingId: string;
  current: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(current);
  const [busy, setBusy] = useState(false);

  async function update(next: string) {
    setBusy(true);
    const res = await fetch(`/api/uploads/${uploadId}/findings/${findingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (res.ok) {
      setStatus(next);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => (
        <Button
          key={o.value}
          variant={status === o.value ? "default" : "outline"}
          size="sm"
          disabled={busy}
          onClick={() => update(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
