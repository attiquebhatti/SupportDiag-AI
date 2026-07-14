import { DiagEvent, EnrichedFinding } from "./types";

export interface CorrelationGroup {
  id: string;
  label: string;
  keys: string[];
  eventCount: number;
  categories: string[];
  timespan: { start: string | null; end: string | null };
}

const GENERIC_KEYS = new Set(["oom", "reboot", "process-restart", "crash", "ha", "interface", "commit", "mp-cpu", "dp-cpu", "memory"]);
const WINDOW_MS = 5 * 60 * 1000; // 5-minute cascade window

/** Non-generic correlation keys (process names, ports, IPs). */
function specificKeys(e: DiagEvent): string[] {
  return e.correlationKeys.filter((k) => !GENERIC_KEYS.has(k));
}

/**
 * Correlate diagnostic events into groups and annotate findings with the
 * related evidence. Grouping is by (a) shared specific key (e.g. process name)
 * and (b) time proximity across related categories (OOM↔Crash↔Process↔Reboot).
 */
export function correlate(
  events: DiagEvent[],
  findings: EnrichedFinding[]
): { groups: CorrelationGroup[]; findings: EnrichedFinding[] } {
  const groups: CorrelationGroup[] = [];

  // (a) Group by shared specific key.
  const byKey = new Map<string, DiagEvent[]>();
  for (const e of events) {
    for (const k of specificKeys(e)) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(e);
    }
  }
  for (const [key, evs] of byKey) {
    const categories = [...new Set(evs.map((e) => e.category))];
    if (evs.length < 2 || categories.length < 2) continue; // needs cross-category signal
    const times = evs.map((e) => e.normalizedTimestamp).filter(Boolean).sort() as string[];
    groups.push({
      id: `key:${key}`,
      label: `Events involving "${key}"`,
      keys: [key],
      eventCount: evs.length,
      categories,
      timespan: { start: times[0] ?? null, end: times[times.length - 1] ?? null },
    });
  }

  // (b) Time-window cascades across resource/crash/process/reboot categories.
  const cascadeCats = new Set(["OOM", "Crash", "Process", "Reboot", "Resource"]);
  const timed = events
    .filter((e) => e.normalizedTimestamp && cascadeCats.has(e.category))
    .sort((a, b) => (a.normalizedTimestamp! < b.normalizedTimestamp! ? -1 : 1));
  let cluster: DiagEvent[] = [];
  const flushCluster = () => {
    const cats = [...new Set(cluster.map((e) => e.category))];
    if (cluster.length >= 2 && cats.length >= 2) {
      const times = cluster.map((e) => e.normalizedTimestamp!).sort();
      groups.push({
        id: `time:${times[0]}`,
        label: `Cascade within 5 min (${cats.join(" → ")})`,
        keys: [],
        eventCount: cluster.length,
        categories: cats,
        timespan: { start: times[0], end: times[times.length - 1] },
      });
    }
  };
  for (const e of timed) {
    if (cluster.length === 0) {
      cluster = [e];
      continue;
    }
    const last = Date.parse(cluster[cluster.length - 1].normalizedTimestamp!);
    if (Date.parse(e.normalizedTimestamp!) - last <= WINDOW_MS) cluster.push(e);
    else {
      flushCluster();
      cluster = [e];
    }
  }
  flushCluster();

  // Annotate findings with correlation notes.
  const annotated = findings.map((f) => {
    const notes: string[] = [];
    const proc = f.details.affectedProcess?.toLowerCase();

    if (proc) {
      const related = events.filter((e) => e.correlationKeys.includes(proc));
      const cats = [...new Set(related.map((e) => e.category))].filter((c) => c.toLowerCase() !== f.category.toLowerCase());
      if (cats.length > 0) notes.push(`${related.length} related event(s) for ${proc}: ${cats.join(", ")}.`);
    }

    // OOM ↔ crash/reboot cascade note.
    if (f.ruleId === "RES-OOM") {
      const crashes = events.filter((e) => e.category === "Crash").length;
      const reboots = events.filter((e) => e.category === "Reboot").length;
      if (crashes > 0) notes.push(`Correlated with ${crashes} crash/core event(s) — the OOM may have killed a process that then dumped core.`);
      if (reboots > 0) notes.push(`Correlated with ${reboots} reboot indicator(s) in the same bundle.`);
    }
    if (f.ruleId === "CRASH-CORE") {
      const oom = events.filter((e) => e.category === "OOM").length;
      if (oom > 0) notes.push(`Correlated with ${oom} out-of-memory event(s) — evaluate OOM-induced kill as the crash trigger.`);
    }
    if (f.ruleId === "HA-PEER-DOWN" || f.ruleId === "HA-SPLIT-BRAIN") {
      const ifErr = events.filter((e) => e.category === "Interface").length;
      if (ifErr > 0) notes.push(`Correlated with ${ifErr} interface error/flap event(s) — check whether an HA link is affected.`);
    }

    if (notes.length === 0) return f;
    return { ...f, details: { ...f.details, correlation: [...(f.details.correlation ?? []), ...notes] } };
  });

  return { groups, findings: annotated };
}
