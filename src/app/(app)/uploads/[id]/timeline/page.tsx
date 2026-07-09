import { prisma } from "@/lib/prisma";
import { redactText } from "@/lib/redaction";
import { CaseTimeline, type TimelineEvent } from "@/components/case-timeline";

export const dynamic = "force-dynamic";

// Extract timestamped events from parsed artifacts (generic log scans, system
// events, commit logs, and Cortex/XSIAM keyword hits) to build a case timeline.
export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artifacts = await prisma.parsedArtifact.findMany({ where: { uploadId: id } });

  const events: TimelineEvent[] = [];

  for (const a of artifacts) {
    const data = a.dataJson as Record<string, unknown>;

    if (a.artifactType === "generic-log-scan") {
      const samples = (data.samples as Array<{ ts: string | null; text: string }>) ?? [];
      for (const s of samples) {
        events.push({ time: s.ts, category: "Logs", severity: /crash|panic|conserve/i.test(s.text) ? "High" : "Medium", source: a.sourceFilePath ?? "log", text: redactText(s.text).slice(0, 260) });
      }
    }

    if (a.artifactType === "system-events") {
      for (const r of ((data.recentReboots as string[]) ?? [])) events.push({ time: null, category: "System Health", severity: "High", source: a.sourceFilePath ?? "system-log", text: redactText(r).slice(0, 260) });
      for (const r of ((data.recentRestarts as string[]) ?? [])) events.push({ time: null, category: "System Health", severity: "Medium", source: a.sourceFilePath ?? "system-log", text: redactText(r).slice(0, 260) });
    }

    if (a.artifactType === "commit-logs") {
      for (const r of ((data.recentFailures as string[]) ?? [])) events.push({ time: null, category: "Commit & Config", severity: "High", source: a.sourceFilePath ?? "config-log", text: redactText(r).slice(0, 260) });
    }

    if (a.artifactType.startsWith("cortex-") || a.artifactType.startsWith("xsiam-")) {
      for (const s of ((data.samples as string[]) ?? [])) events.push({ time: null, category: a.artifactType.startsWith("xsiam") ? "XSIAM Ingestion" : "Cortex Agent", severity: "Medium", source: a.sourceFilePath ?? a.artifactType, text: redactText(s).slice(0, 260) });
    }
  }

  // Sort: timestamped events first (desc), then untimed.
  events.sort((a, b) => {
    if (a.time && b.time) return b.time.localeCompare(a.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Timeline</h2>
        <p className="text-sm text-muted-foreground">Timestamped events extracted from logs and diagnostics. Sensitive values are redacted.</p>
      </div>
      <CaseTimeline events={events.slice(0, 500)} />
    </div>
  );
}
