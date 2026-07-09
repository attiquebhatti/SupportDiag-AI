import type { ParserArtifact } from "../parsers/types";
import { Rule, Finding, RuleContext } from "./types";
import { systemHealthRules } from "./system-health";
import { haRules } from "./ha";
import { interfaceRules } from "./interfaces";
import { routingRules } from "./routing";
import { vpnRules } from "./vpn";
import { panoramaRules } from "./panorama";
import { configRules } from "./config";
import { licensingRules } from "./licensing";

export const allRules: Rule[] = [
  ...systemHealthRules,
  ...haRules,
  ...interfaceRules,
  ...routingRules,
  ...vpnRules,
  ...panoramaRules,
  ...configRules,
  ...licensingRules,
];

export function buildContext(artifacts: ParserArtifact[]): RuleContext {
  return {
    artifacts,
    byType: (type) => artifacts.filter((a) => a.artifactType === type),
    first: (type) => artifacts.find((a) => a.artifactType === type)?.dataJson ?? {},
    all: (type) => artifacts.filter((a) => a.artifactType === type).map((a) => a.dataJson),
  };
}

const SEVERITY_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Informational: 4,
};

/** Run a specific set of rules against artifacts, sorted by severity. */
export function runRuleSet(rules: Rule[], artifacts: ParserArtifact[]): Finding[] {
  const ctx = buildContext(artifacts);
  const findings: Finding[] = [];
  for (const rule of rules) {
    try {
      findings.push(...rule.evaluate(ctx));
    } catch {
      // Rule failures are isolated so one bad rule cannot fail the analysis.
    }
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return findings;
}

/** Run the full PAN-OS rule set (backward-compatible default). */
export function runRules(artifacts: ParserArtifact[]): Finding[] {
  return runRuleSet(allRules, artifacts);
}

export * from "./types";
