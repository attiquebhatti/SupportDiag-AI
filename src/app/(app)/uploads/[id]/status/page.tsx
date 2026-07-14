"use client";
import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  "queued", "downloading", "extracting", "indexing", "detecting", "normalizing",
  "parsing", "device-detection", "matching-known-issues", "analyzing",
  "summarizing", "completed",
];

interface Status {
  status: string;
  job: {
    status: string;
    currentStep: string;
    progress: number;
    errorMessage: string | null;
  } | null;
}

export default function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<Status | null>(null);
  const [retrying, setRetrying] = useState(false);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/uploads/${id}/status`);
    if (res.ok) {
      const json: Status = await res.json();
      setData(json);
      if (json.job?.status === "COMPLETED") {
        setTimeout(() => router.replace(`/uploads/${id}`), 600);
      }
    }
  }, [id, router]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, [poll]);

  async function retry() {
    setRetrying(true);
    await fetch(`/api/uploads/${id}/process`, { method: "POST" }).catch(() => {});
    setRetrying(false);
    poll();
  }

  const job = data?.job;
  const failed = job?.status === "FAILED";
  const done = job?.status === "COMPLETED";
  const progress = job?.progress ?? 0;
  const currentStep = job?.currentStep ?? "queued";

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardContent className="p-8 text-center">
          {done ? (
            <CheckCircle2 className="mx-auto h-12 w-12 text-low" />
          ) : failed ? (
            <XCircle className="mx-auto h-12 w-12 text-critical" />
          ) : (
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          )}

          <h2 className="mt-4 text-lg font-semibold">
            {done ? "Analysis complete" : failed ? "Analysis failed" : "Analyzing support file"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {failed ? job?.errorMessage || "An error occurred." : `Current step: ${currentStep}`}
          </p>

          {!failed && (
            <div className="mt-6">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{progress}%</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-1.5">
            {STEPS.map((s) => {
              const idx = STEPS.indexOf(currentStep);
              const sIdx = STEPS.indexOf(s);
              const state = done || sIdx < idx ? "done" : sIdx === idx ? "active" : "todo";
              return (
                <span
                  key={s}
                  className={
                    "rounded-full px-2 py-0.5 text-[10px] " +
                    (state === "done"
                      ? "bg-low/15 text-low"
                      : state === "active"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  {s}
                </span>
              );
            })}
          </div>

          {failed && (
            <Button className="mt-6" onClick={retry} disabled={retrying}>
              <PlayCircle className="h-4 w-4" /> {retrying ? "Retrying…" : "Retry analysis"}
            </Button>
          )}
          {done && (
            <Button className="mt-6" onClick={() => router.replace(`/uploads/${id}`)}>
              View analysis
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
