import { Rule, Finding, evidenceFrom } from "./types";

interface SecRule {
  name: string;
  logStart: boolean;
  logEnd: boolean;
  hasProfile: boolean;
  action: string | null;
  disabled: boolean;
  sourceAny?: boolean;
  destAny?: boolean;
}

export const configRules: Rule[] = [
  {
    id: "CFG-001-COMMIT-FAILED",
    category: "Commit & Config",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("commit-logs")[0];
      if (!a) return [];
      if ((a.dataJson.lastStatus as string) !== "failed") return [];
      return [
        {
          ruleId: "CFG-001-COMMIT-FAILED",
          severity: "High",
          category: "Commit & Config",
          title: "Recent commit failed",
          description: "The most recent commit in the config/job log failed.",
          impact: "A failed commit means recent configuration changes were not applied.",
          evidence: ((a.dataJson.recentFailures as string[]) ?? []).slice(-3).map((l) => evidenceFrom(a, l)),
          recommendation: "Review the commit job details for the specific validation/error message and re-commit after fixing.",
          confidence: 75,
        },
      ];
    },
  },
  {
    id: "CFG-002-VALIDATION-ERROR",
    category: "Commit & Config",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("commit-logs")[0];
      if (!a || !a.dataJson.validationError) return [];
      return [
        {
          ruleId: "CFG-002-VALIDATION-ERROR",
          severity: "Medium",
          category: "Commit & Config",
          title: "Validation error detected",
          description: "One or more configuration validation errors were found in the logs.",
          impact: "Validation errors block commits and indicate an inconsistent configuration.",
          evidence: [evidenceFrom(a, "Validation error present in config log")],
          recommendation: "Run a config validate and resolve each reported inconsistency.",
          confidence: 60,
        },
      ];
    },
  },
  {
    id: "CFG-003-RULE-NO-LOGGING",
    category: "Commit & Config",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("security-rules")[0];
      if (!a) return [];
      const rules = ((a.dataJson.rules as SecRule[]) ?? []).filter((r) => !r.disabled);
      const noLog = rules.filter((r) => !r.logEnd && !r.logStart && r.action !== "deny");
      if (noLog.length === 0) return [];
      return [
        {
          ruleId: "CFG-003-RULE-NO-LOGGING",
          severity: "Low",
          category: "Commit & Config",
          title: "Security rule(s) without logging",
          description: `${noLog.length} enabled security rule(s) have no log-start or log-end setting.`,
          impact: "Traffic matching these rules will not be logged, reducing visibility and forensic capability.",
          evidence: noLog.slice(0, 10).map((r) => evidenceFrom(a, `Rule "${r.name}" has no logging enabled`)),
          recommendation: "Enable Log at Session End on allow rules (and a log forwarding profile where applicable).",
          confidence: 70,
        },
      ];
    },
  },
  {
    id: "CFG-004-RULE-NO-PROFILE",
    category: "Commit & Config",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("security-rules")[0];
      if (!a) return [];
      const rules = ((a.dataJson.rules as SecRule[]) ?? []).filter((r) => !r.disabled);
      const allowNoProfile = rules.filter((r) => r.action === "allow" && !r.hasProfile);
      if (allowNoProfile.length === 0) return [];
      return [
        {
          ruleId: "CFG-004-RULE-NO-PROFILE",
          severity: "Medium",
          category: "Commit & Config",
          title: "Allow rule(s) without security profiles",
          description: `${allowNoProfile.length} allow rule(s) have no security profile / profile group attached.`,
          impact: "Allowed traffic is not inspected for threats, URLs, or files, weakening the security posture.",
          evidence: allowNoProfile.slice(0, 10).map((r) => evidenceFrom(a, `Rule "${r.name}" allows traffic with no security profile`)),
          recommendation: "Attach an appropriate Security Profile Group (AV, AS, Vulnerability, URL, WildFire) to allow rules.",
          confidence: 72,
        },
      ];
    },
  },
  {
    id: "CFG-005-ANY-ANY-ALLOW",
    category: "Commit & Config",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("security-rules")[0];
      if (!a) return [];
      const rules = ((a.dataJson.rules as SecRule[]) ?? []).filter((r) => !r.disabled);
      const anyAny = rules.filter((r) => r.action === "allow" && r.sourceAny && r.destAny);
      if (anyAny.length === 0) return [];
      return [
        {
          ruleId: "CFG-005-ANY-ANY-ALLOW",
          severity: "High",
          category: "Commit & Config",
          title: "Any-any allow rule detected",
          description: `${anyAny.length} enabled security rule(s) allow traffic with source AND destination set to "any".`,
          impact: "Overly permissive any-any allow rules bypass segmentation and dramatically widen the attack surface.",
          evidence: anyAny.slice(0, 10).map((r) => evidenceFrom(a, `Rule "${r.name}" allows any -> any`)),
          recommendation: "Tighten source/destination/application on these rules to least-privilege, and ensure logging + security profiles are applied.",
          confidence: 74,
        },
      ];
    },
  },
];
