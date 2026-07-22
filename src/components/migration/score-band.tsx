import { cn } from "@/lib/utils";

/** Colour bands mirror the §23 score thresholds. */
function toneFor(score: number): string {
  if (score >= 95) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
  if (score >= 85) return "border-lime-500/30 bg-lime-500/10 text-lime-600";
  if (score >= 70) return "border-amber-500/30 bg-amber-500/10 text-amber-500";
  if (score >= 50) return "border-orange-500/30 bg-orange-500/10 text-orange-500";
  return "border-red-500/30 bg-red-500/10 text-red-500";
}

export function ScoreBand({
  score,
  band,
  compact = false,
}: {
  score: number;
  band?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
          toneFor(score)
        )}
      >
        {score}
      </span>
    );
  }
  return (
    <div className={cn("rounded-lg border px-4 py-3", toneFor(score))}>
      <div className="text-3xl font-semibold">{score}</div>
      {band && <div className="text-xs font-medium">{band}</div>}
    </div>
  );
}

/** A single labelled score with a proportional bar. */
export function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", value === null && "text-muted-foreground")}>
          {value === null ? "Not evaluated" : value}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        {value !== null && (
          <div
            className={cn(
              "h-full rounded-full",
              value >= 95
                ? "bg-emerald-500"
                : value >= 85
                  ? "bg-lime-500"
                  : value >= 70
                    ? "bg-amber-500"
                    : value >= 50
                      ? "bg-orange-500"
                      : "bg-red-500"
            )}
            style={{ width: `${Math.max(2, value)}%` }}
          />
        )}
      </div>
    </div>
  );
}
