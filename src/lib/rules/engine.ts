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

function buildContext(artifacts: ParserArtifact[]): RuleContext {
  return {
    artifacts,
    byType: (type) => artifacts.filter((a) => a.artifactType === type),
    first: (type) => artifacts.find((a) => a.artifactType === type)?.dataJson ?? {},
    all: (type) => artifacts.filter((a) => a.artifactType === type).map((a) => a.dataJson),
  };
}

/** Run every rule against the parsed artifacts and collect findings. */
export function runRules(artifacts: ParserArtifact[]): Finding[] {
  const ctx = buildContext(artifacts);
  const findings: Finding[] = [];
  for (const rule of allRules) {
    try {
      findings.push(...rule.evaluate(ctx));
    } catch {
      // Rule failures are isolated so one bad rule cannot fail the analysis.
    }
  }
  // Sort by severity (most severe first).
  const order: Record<string, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
    Informational: 4,
  };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return findings;
}

export * from "./types";
