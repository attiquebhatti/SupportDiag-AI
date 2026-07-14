import { Analyzer, AnalyzerContext, AnalyzerResult, DiagEvent, EnrichedFinding, Evidence } from "./types";
import { parseTimestamp } from "./timestamps";
import { classifyPath } from "../artifacts";

export function filesOfFamily(ctx: AnalyzerContext, familyId: string) {
  return ctx.files.filter((f) => f.content && classifyPath(f.path)?.id === familyId);
}

/** Scan a family's files for a regex, returning capped evidence + events. */
function scan(
  ctx: AnalyzerContext,
  familyId: string,
  re: RegExp,
  max = 20
): Array<{ path: string; line: number; text: string }> {
  const out: Array<{ path: string; line: number; text: string }> = [];
  for (const f of filesOfFamily(ctx, familyId)) {
    const lines = (f.content as string).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        out.push({ path: f.path, line: i + 1, text: lines[i].slice(0, 300) });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

const CPU_HI = 85;
const MEM_HI = 90;
const DISK_HI = 90;

export const resourceAnalyzer: Analyzer = {
  id: "resource-health",
  run(ctx: AnalyzerContext): AnalyzerResult {
    const findings: EnrichedFinding[] = [];
    const events: DiagEvent[] = [];

    const mp = ctx.first("mp-resources");
    const dp = ctx.first("dp-resources");

    // --- OOM detection (system.log) ---
    const oom = scan(ctx, "SYSTEM_LOG", /out of memory|oom[- ]?kill|killed process/i);
    if (oom.length > 0) {
      const proc = oom
        .map((h) => h.text.match(/killed process \d+ \(([^)]+)\)|process ([a-z0-9_]+)/i))
        .map((m) => (m ? m[1] || m[2] : null))
        .find(Boolean);
      for (const h of oom) {
        const ts = parseTimestamp(h.text);
        events.push({
          category: "OOM",
          eventType: "out-of-memory",
          severity: "High",
          rawTimestamp: ts.raw || null,
          normalizedTimestamp: ts.iso,
          precision: ts.precision,
          title: "Out-of-memory event",
          source: { filePath: h.path, line: h.line, snippet: h.text },
          correlationKeys: ["oom", ...(proc ? [proc.toLowerCase()] : [])],
        });
      }
      findings.push({
        ruleId: "RES-OOM",
        category: "Resource Health",
        severity: "High",
        title: "Out-of-memory condition detected",
        summary: `${oom.length} out-of-memory indicator(s) were found in the system log${proc ? `, affecting ${proc}` : ""}.`,
        technicalImpact:
          "An OOM condition forces the kernel to kill processes, which can restart management/dataplane services and disrupt traffic or management access.",
        recommendation:
          "Correlate the OOM timestamps with `show system resources` and per-process memory. Check for a memory leak in the affected process against the running release's advisories, and capture a fresh TSF after the next occurrence.",
        confidence: 80,
        evidence: oom.slice(0, 4).map((h): Evidence => ({ filePath: h.path, line: h.line, snippet: h.text })),
        details: {
          plane: "mp",
          affectedProcess: proc ?? undefined,
          probableCause: "Memory exhaustion (leak or sizing) leading to kernel OOM-kill.",
          alternativeCauses: ["Transient load spike", "Known software memory defect on the running version"],
          knownIssuePossibility: "See Known Issues → OOM / pan_task family.",
        },
      });
    }

    // --- pan_task saturation ---
    const pantask = scan(ctx, "SYSTEM_LOG", /pan_task.*(saturat|pressure|busy|100%)/i)
      .concat(scan(ctx, "DP_MONITOR_LOG", /pan_task.*(saturat|pressure|busy|100%)/i));
    if (pantask.length > 0) {
      findings.push({
        ruleId: "RES-PANTASK",
        category: "Resource Health",
        severity: "High",
        title: "pan_task saturation detected",
        summary: `${pantask.length} indicator(s) of pan_task saturation / dataplane task pressure were found.`,
        technicalImpact:
          "pan_task saturation indicates the dataplane is CPU-bound, which can cause packet buffer congestion, latency, and session drops.",
        recommendation:
          "Compare throughput and decryption load against platform capacity, review `show running resource-monitor`, and check for packet-diag left enabled (which adds dataplane load).",
        confidence: 70,
        evidence: pantask.slice(0, 4).map((h): Evidence => ({ filePath: h.path, line: h.line, snippet: h.text })),
        details: { plane: "dp", probableCause: "Sustained dataplane CPU pressure.", knownIssuePossibility: "See Known Issues → OOM / pan_task family." },
      });
    }

    // --- packet-diag left enabled ---
    const pdiag = scan(ctx, "CLI_TECHSUPPORT", /packet[- ]diag.*(on|enable)|pan_packet_diag\.log/i)
      .filter((h) => !/off|disable/i.test(h.text));
    if (pdiag.length > 0) {
      findings.push({
        ruleId: "RES-PACKET-DIAG",
        category: "Resource Health",
        severity: "Medium",
        title: "Packet-diag appears to be left enabled",
        summary: "Packet-diagnostic capture / debug appears enabled in the CLI evidence.",
        technicalImpact:
          "Packet-diag left enabled (especially with broad filters) increases dataplane load and grows pan_packet_diag.log, and is a common cause of avoidable resource pressure.",
        recommendation:
          "Disable packet-diag and clear filters (`debug dataplane packet-diag set capture off`, `... clear all`) once troubleshooting is complete; verify pan_packet_diag.log stops growing.",
        confidence: 60,
        evidence: pdiag.slice(0, 3).map((h): Evidence => ({ filePath: h.path, line: h.line, snippet: h.text })),
        details: { plane: "dp", probableCause: "Operational — debug capture not disabled after troubleshooting." },
      });
    }

    // --- disk / root partition pressure (from mp-resources) ---
    const disks = (mp.disks as Array<{ mount: string; usedPercent: number }>) ?? [];
    const fullDisks = disks.filter((d) => d.usedPercent >= DISK_HI);
    if (fullDisks.length > 0) {
      findings.push({
        ruleId: "RES-DISK",
        category: "Resource Health",
        severity: fullDisks.some((d) => d.usedPercent >= 95) ? "High" : "Medium",
        title: "Low disk space",
        summary: `Partition pressure ≥ ${DISK_HI}%: ${fullDisks.map((d) => `${d.mount} (${d.usedPercent}%)`).join(", ")}.`,
        technicalImpact: "A full root/log partition can block logging, commits, content updates, and core-file capture.",
        recommendation: "Clear old logs/cores, verify log quotas, and expand the affected partition if applicable.",
        confidence: 85,
        evidence: fullDisks.map((d): Evidence => ({ filePath: "show system disk-space", snippet: `${d.mount}: ${d.usedPercent}% used` })),
        details: { plane: "mp", probableCause: fullDisks.some((d) => /root/.test(d.mount)) ? "Root partition pressure." : "Log/data partition pressure." },
      });
    }

    // --- reboots + process restarts → events (findings kept lightweight; timeline-focused) ---
    const sysEvents = ctx.first("system-events");
    for (const r of ((sysEvents.recentReboots as string[]) ?? [])) {
      const ts = parseTimestamp(r);
      events.push({
        category: "Reboot", eventType: "reboot", severity: "High",
        rawTimestamp: ts.raw || null, normalizedTimestamp: ts.iso, precision: ts.precision,
        title: "Reboot / restart indicator", source: { filePath: "SYSTEM_LOG", snippet: r.slice(0, 300) },
        correlationKeys: ["reboot"],
      });
    }
    for (const r of ((sysEvents.recentRestarts as string[]) ?? [])) {
      const ts = parseTimestamp(r);
      const proc = r.match(/process\s+([a-z0-9_]+)/i)?.[1];
      events.push({
        category: "Process", eventType: "process-restart", severity: "Medium",
        rawTimestamp: ts.raw || null, normalizedTimestamp: ts.iso, precision: ts.precision,
        title: "Process restart", source: { filePath: "SYSTEM_LOG", snippet: r.slice(0, 300) },
        correlationKeys: ["process-restart", ...(proc ? [proc.toLowerCase()] : [])],
      });
    }

    // --- high CPU/mem → events for correlation (baseline rules already flag findings) ---
    const mpCpu = mp.cpuPercent as number | null;
    const dpCpu = (dp.maxCorePercent ?? dp.avgCorePercent) as number | null;
    const mem = mp.memoryPercent as number | null;
    if (mpCpu != null && mpCpu >= CPU_HI)
      events.push({ category: "Resource", eventType: "mp-cpu-high", severity: "Medium", rawTimestamp: null, normalizedTimestamp: null, precision: "none", title: `Management CPU ${mpCpu}%`, source: { filePath: "show system resources", snippet: `MP CPU ${mpCpu}%` }, correlationKeys: ["mp-cpu"] });
    if (dpCpu != null && dpCpu >= CPU_HI)
      events.push({ category: "Resource", eventType: "dp-cpu-high", severity: "Medium", rawTimestamp: null, normalizedTimestamp: null, precision: "none", title: `Data-plane CPU ${dpCpu}%`, source: { filePath: "show running resource-monitor", snippet: `DP CPU ${dpCpu}%` }, correlationKeys: ["dp-cpu"] });
    if (mem != null && mem >= MEM_HI)
      events.push({ category: "Resource", eventType: "mem-high", severity: "Medium", rawTimestamp: null, normalizedTimestamp: null, precision: "none", title: `Memory ${mem}%`, source: { filePath: "show system resources", snippet: `Memory ${mem}%` }, correlationKeys: ["memory"] });

    return { findings, events };
  },
};
