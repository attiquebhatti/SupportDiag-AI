"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function RetryButton({ uploadId, className }: { uploadId: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    await fetch(`/api/uploads/${uploadId}/process`, { method: "POST" }).catch(() => {});
    setBusy(false);
    router.push(`/uploads/${uploadId}/status`);
  }

  return (
    <button
      onClick={retry}
      disabled={busy}
      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50", className)}
    >
      <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} /> Retry
    </button>
  );
}
