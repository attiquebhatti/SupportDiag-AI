import { Analyzer, AnalyzerContext, AnalyzerResult, DiagEvent, EnrichedFinding, Evidence } from "./types";
import { parseTimestamp } from "./timestamps";
import { filesOfFamily } from "./resource";

function scanFamilies(ctx: AnalyzerContext, families: string[], re: RegExp, max = 15) {
  const out: Array<{ path: string; line: number; text: string }> = [];
  for (const fam of families) {
    for (const f of filesOfFamily(ctx, fam)) {
      const lines = (f.content as string).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          out.push({ path: f.path, line: i + 1, text: lines[i].slice(0, 300) });
          if (out.length >= max) return out;
        }
      }
    }
  }
  return out;
}

// Commit-failure analyzer (§12): ms.log / devsrvr.log / commit logs → likely cause.
export const commitAnalyzer: Analyzer = {
  id: "commit-failure",
  run(ctx: AnalyzerContext): AnalyzerResult {
    const findings: EnrichedFinding[] = [];
    const events: DiagEvent[] = [];

    const commitLogs = ctx.first("commit-logs");
    const commitFailed = commitLogs.lastStatus === "failed" || (commitLogs.failedCount as number) > 0;

    // ID population / exhaustion signatures.
    const idSig = scanFamilies(
      ctx,
      ["COMMIT_MANAGER_LOG", "DEVICE_SERVER_LOG"],
      /(error populating id|id population failed|no id available|idmgr|out of .* id)/i
    );
    // DB corruption signatures.
    const dbSig = scanFamilies(
      ctx,
      ["COMMIT_MANAGER_LOG", "DEVICE_SERVER_LOG", "CONFIGD_LOG"],
      /(database corrupt|db corrupt|corrupted|schema.*mismatch)/i
    );
    // Validation errors.
    const valSig = scanFamilies(
      ctx,
      ["COMMIT_MANAGER_LOG", "DEVICE_SERVER_LOG"],
      /validation (error|failed)|commit failed/i
    );

    for (const h of [...idSig, ...dbSig, ...valSig].slice(0, 30)) {
      const ts = parseTimestamp(h.text);
      events.push({
        category: "Commit", eventType: "commit-failure", severity: "High",
        rawTimestamp: ts.raw || null, normalizedTimestamp: ts.iso, precision: ts.precision,
        title: "Commit failure log", source: { filePath: h.path, line: h.line, snippet: h.text },
        correlationKeys: ["commit"],
      });
    }

    if (idSig.length > 0) {
      const objMatch = idSig.map((h) => h.text.match(/(?:object|type|name)[=: ]+["']?([a-z0-9_.-]+)/i)?.[1]).find(Boolean);
      findings.push({
        ruleId: "CFG-ID-POPULATION",
        category: "Commit & Configuration",
        severity: "High",
        title: "Commit failure — ID manager population/exhaustion",
        summary: `${idSig.length} ID-manager population/exhaustion signature(s) found in commit logs${objMatch ? ` (near ${objMatch})` : ""}.`,
        technicalImpact:
          "When the ID manager cannot allocate IDs, commits fail and configuration changes are not applied.",
        recommendation:
          "Identify the object family exhausting IDs in ms.log/devsrvr.log, compare object counts against platform limits, and consult vendor guidance on ID-manager recovery before attempting fixes.",
        confidence: 70,
        evidence: idSig.slice(0, 4).map((h): Evidence => ({ filePath: h.path, line: h.line, snippet: h.text })),
        details: {
          plane: "mp",
          probableCause: "Object-count exhaustion or ID-manager database issue.",
          alternativeCauses: ["Corrupted ID-manager database", "Known software defect"],
          knownIssuePossibility: "See Known Issues → Commit ID population family.",
        },
      });
    }

    if (dbSig.length > 0) {
      findings.push({
        ruleId: "CFG-DB-CORRUPTION",
        category: "Commit & Configuration",
        severity: "High",
        title: "Configuration database corruption indicators",
        summary: `${dbSig.length} database-corruption signature(s) found in configuration/commit logs.`,
        technicalImpact: "Config/ID database corruption can block commits and cause inconsistent configuration state.",
        recommendation:
          "Do not attempt ad-hoc fixes — capture the exact log messages and engage TAC for guided database recovery for the running release.",
        confidence: 60,
        evidence: dbSig.slice(0, 4).map((h): Evidence => ({ filePath: h.path, line: h.line, snippet: h.text })),
        details: { plane: "mp", probableCause: "Corrupted configuration/ID database." },
      });
    }

    if (commitFailed && idSig.length === 0 && dbSig.length === 0) {
      const recent = (commitLogs.recentFailures as string[]) ?? [];
      findings.push({
        ruleId: "CFG-COMMIT-FAILED",
        category: "Commit & Configuration",
        severity: "High",
        title: "Recent commit failed",
        summary: "The most recent commit failed; no ID-exhaustion or DB-corruption signature was matched.",
        technicalImpact: "Recent configuration changes were not applied.",
        recommendation: "Review the commit job's validation output for the specific error and re-commit after resolving it.",
        confidence: 65,
        evidence: recent.slice(0, 3).map((t): Evidence => ({ filePath: "config log", snippet: t })),
        details: { plane: "mp", probableCause: "Validation error or dependency issue.", alternativeCauses: ["Template/device-group push issue (Panorama)", "Plugin mismatch"] },
      });
    }

    return { findings, events };
  },
};
