import { Analyzer, AnalyzerContext, AnalyzerResult, DiagEvent, EnrichedFinding, Evidence } from "./types";
import { parseTimestamp } from "./timestamps";
import { classifyPath } from "../artifacts";

const CORE_RE = /(?:^|\/)([a-z0-9_.-]+)\.core\b|core\.(\d+)|([a-z0-9_]+)_\d+\.core|crashinfo|kernel[_-]panic/i;

/** Guess process + plane from a core file path/name. */
function coreMeta(path: string): { process: string | null; plane: "mp" | "dp" | "cp" | "system" } {
  const lower = path.toLowerCase();
  const plane = /var\.dp\d+|dp\d+-log|s\d+dp/.test(lower) ? "dp" : /cp-log|control/.test(lower) ? "cp" : "mp";
  const m = lower.match(/([a-z0-9_]+?)[._-]?\d*\.core/) || lower.match(/cores?\/([a-z0-9_]+)/);
  return { process: m ? m[1] : null, plane };
}

// Crash/core analyzer: identify + correlate core evidence. Never decodes binaries.
export const crashAnalyzer: Analyzer = {
  id: "crash-core",
  run(ctx: AnalyzerContext): AnalyzerResult {
    const findings: EnrichedFinding[] = [];
    const events: DiagEvent[] = [];

    // Core references from the dedicated core-files parser + CORES-family files
    // (directory listings, crashinfo) + `show system files` references.
    const refs: Array<{ path: string; line: number; text: string; process: string | null; plane: string }> = [];

    for (const a of ctx.byType("core-files")) {
      for (const f of ((a.dataJson.files as string[]) ?? [])) {
        const meta = coreMeta(f);
        refs.push({ path: a.sourceFilePath ?? "core listing", line: 0, text: f.slice(0, 200), ...meta });
      }
    }

    // Scan CORES-family files + `show system files` output for core references.
    for (const f of ctx.files) {
      if (!f.content) continue;
      const fam = classifyPath(f.path)?.id;
      const isCoreFamily = fam === "CORES";
      const isShowFiles = /::show-system-files/.test(f.path);
      if (!isCoreFamily && !isShowFiles) continue;
      const lines = f.content.split(/\r?\n/);
      for (let i = 0; i < lines.length && refs.length < 200; i++) {
        if (CORE_RE.test(lines[i])) {
          const meta = coreMeta(lines[i]);
          refs.push({ path: f.path, line: i + 1, text: lines[i].slice(0, 200), ...meta });
        }
      }
    }

    if (refs.length === 0) return { findings, events };

    // Group by process for repeat counts.
    const byProc = new Map<string, typeof refs>();
    for (const r of refs) {
      const key = r.process ?? "unknown";
      if (!byProc.has(key)) byProc.set(key, []);
      byProc.get(key)!.push(r);
    }

    for (const r of refs.slice(0, 50)) {
      const ts = parseTimestamp(r.text);
      events.push({
        category: "Crash",
        eventType: "core-file",
        severity: "High",
        rawTimestamp: ts.raw || null,
        normalizedTimestamp: ts.iso,
        precision: ts.precision,
        title: `Core file${r.process ? ` (${r.process})` : ""}`,
        source: { filePath: r.path, line: r.line || undefined, snippet: r.text },
        correlationKeys: ["crash", ...(r.process ? [r.process.toLowerCase()] : [])],
      });
    }

    const total = refs.length;
    const procs = [...byProc.entries()].map(([p, list]) => `${p} ×${list.length}`).slice(0, 6);
    findings.push({
      ruleId: "CRASH-CORE",
      category: "Crashes & Cores",
      severity: "High",
      title: "Core / crash artifacts detected",
      summary: `${total} core/crash reference(s) found across ${byProc.size} process(es): ${procs.join(", ")}.`,
      technicalImpact:
        "Core files indicate a process crashed. Repeated cores for the same process point to a software defect or a resource/hardware trigger.",
      recommendation:
        "Correlate crash timestamps with resource events (OOM, high DP CPU). SupportDiag does not decode core binaries — collect the cores and open a TAC case for the crashing process, including the running PAN-OS version.",
      confidence: 88,
      evidence: refs.slice(0, 5).map((r): Evidence => ({ filePath: r.path, line: r.line || undefined, snippet: r.text })),
      details: {
        plane: (refs[0].plane as "mp" | "dp" | "cp" | "system") ?? "system",
        affectedProcess: [...byProc.keys()].filter((p) => p !== "unknown")[0],
        probableCause: "Process crash (software defect or resource/hardware trigger).",
        alternativeCauses: ["OOM-induced kill", "Hardware fault", "Known software defect on the running version"],
        knownIssuePossibility: "Correlate the crashing process against release advisories.",
      },
    });

    return { findings, events };
  },
};
