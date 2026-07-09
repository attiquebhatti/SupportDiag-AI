import { Rule, Finding, evidenceFrom } from "./types";

// Vendor-neutral rules from the generic-log-scan artifact. Used as the baseline
// for Check Point / FortiGate (Phase 2) and any unrecognized bundle, so there is
// always some evidence-based signal. Kept conservative (Low/Informational).
export const genericRuleSet: Rule[] = [
  {
    id: "GEN-001-LOG-ERRORS",
    category: "Logs",
    evaluate(ctx): Finding[] {
      const arts = ctx.byType("generic-log-scan");
      if (arts.length === 0) return [];
      const totalErrors = arts.reduce((s, a) => s + ((a.dataJson.errorCount as number) ?? 0), 0);
      if (totalErrors < 5) return [];
      // Pick the file with the most errors for evidence.
      const top = [...arts].sort((a, b) => ((b.dataJson.errorCount as number) ?? 0) - ((a.dataJson.errorCount as number) ?? 0))[0];
      const samples = (top.dataJson.samples as Array<{ text: string }>) ?? [];
      const severity = totalErrors >= 100 ? "Medium" : "Low";
      return [
        {
          ruleId: "GEN-001-LOG-ERRORS",
          severity,
          category: "Logs",
          title: "Elevated error volume in logs",
          description: `${totalErrors} error-level log line(s) across ${arts.length} file(s).`,
          impact: "A high volume of errors often indicates an active fault worth investigating.",
          evidence: samples.slice(0, 3).map((s) => evidenceFrom(top, s.text)),
          recommendation: "Review the top error sources; correlate timestamps in the Timeline view.",
          confidence: 45,
        },
      ];
    },
  },
  {
    id: "GEN-002-CRASH-INDICATORS",
    category: "System Health",
    evaluate(ctx): Finding[] {
      const arts = ctx.byType("generic-log-scan");
      const crashes = arts.flatMap((a) => ((a.dataJson.samples as Array<{ text: string }>) ?? []).filter((s) => /crash|panic|core dump|segfault|conserve mode/i.test(s.text)).map((s) => ({ a, s })));
      if (crashes.length === 0) return [];
      return [
        {
          ruleId: "GEN-002-CRASH-INDICATORS",
          severity: "High",
          category: "System Health",
          title: "Crash / instability indicators detected",
          description: `${crashes.length} crash/panic/conserve-mode indicator(s) found in logs.`,
          impact: "Crashes and conserve-mode events cause outages or degraded processing.",
          evidence: crashes.slice(0, 3).map((c) => evidenceFrom(c.a, c.s.text)),
          recommendation: "Identify the failing component and timestamps; escalate to the vendor if it recurs.",
          confidence: 55,
        },
      ];
    },
  },
];
