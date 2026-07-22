// Migration Assurance scoring (§23).
//
// Deliberately multi-dimensional: a single number hides the difference between
// "every rule migrated but three were broadened" and "one rule missing". Scores
// are computed from field-level parity, never from entity counts, so matching
// rule totals cannot by itself produce a passing score.

import type { ComparisonStatus, Severity } from "@prisma/client";
import type { ComparisonResult, EntityComparison, FindingDraft } from "./compare/types";

/** Parity credit awarded per comparison status. */
const STATUS_CREDIT: Record<ComparisonStatus, number> = {
  EXACT_MATCH: 1,
  EQUIVALENT_MATCH: 1,
  TRANSFORMED_MATCH: 0.95,
  PARTIAL_MATCH: 0.5,
  REQUIRES_MANUAL_REVIEW: 0.5,
  UNSUPPORTED: 0.25,
  EXTRA_IN_TARGET: 0.5,
  CONFLICT: 0,
  MISSING_IN_TARGET: 0,
  MISSING_IN_MIGRATED: 0,
  NOT_EVALUATED: 1,
};

const SEVERITY_PENALTY: Record<Severity, number> = {
  CRITICAL: 25,
  HIGH: 12,
  MEDIUM: 5,
  LOW: 1,
  INFORMATIONAL: 0,
};

export interface ScoreBreakdown {
  objectParity: number | null;
  securityPolicyParity: number | null;
  natPolicyParity: number | null;
  decryptionPolicyParity: number | null;
  otherPolicyParity: number | null;
  dependencyIntegrity: number | null;
  ruleOrderIntegrity: number | null;
  deploymentVerification: number | null;
  behavioralTest: number | null;
  securityRegression: number | null;
  overall: number;
  band: ScoreBand;
}

export type ScoreBand =
  | "Validated"
  | "Validated with Minor Differences"
  | "Requires Review"
  | "Significant Migration Gaps"
  | "Migration Validation Failed";

export function bandFor(score: number): ScoreBand {
  if (score >= 95) return "Validated";
  if (score >= 85) return "Validated with Minor Differences";
  if (score >= 70) return "Requires Review";
  if (score >= 50) return "Significant Migration Gaps";
  return "Migration Validation Failed";
}

/** Which inputs were actually available, so scores are read in context (§23). */
export interface Completeness {
  sourceProvided: boolean;
  migratedProvided: boolean;
  targetRetrieved: boolean;
  commitValidated: boolean;
  deploymentVerified: boolean;
  policyTestsCompleted: boolean;
  runtimeChecksCompleted: boolean;
}

function parity(comparisons: EntityComparison[], types: string[]): number | null {
  const subset = comparisons.filter((c) => types.includes(c.objectType));
  if (!subset.length) return null;
  let credit = 0;
  for (const c of subset) {
    // Both hops matter; average them so a clean migration that failed to deploy
    // cannot score as highly as one that deployed correctly.
    const hops: number[] = [STATUS_CREDIT[c.sourceToMigrated] ?? 0];
    if (c.migratedToDeployed !== "NOT_EVALUATED") {
      hops.push(STATUS_CREDIT[c.migratedToDeployed] ?? 0);
    }
    let value = hops.reduce((a, b) => a + b, 0) / hops.length;
    // Field-level differences reduce credit even when the entity "matched".
    if (c.differences.length) {
      const weighted = Math.min(0.4, c.differences.length * 0.08);
      value = Math.max(0, value - weighted);
    }
    credit += value;
  }
  return round((credit / subset.length) * 100);
}

function penaltyScore(findings: FindingDraft[], types: string[]): number | null {
  const subset = findings.filter((f) => types.some((t) => f.findingType.startsWith(t)));
  let score = 100;
  for (const f of subset) score -= SEVERITY_PENALTY[f.severity] ?? 0;
  return round(Math.max(0, score));
}

export function computeScores(
  result: ComparisonResult,
  completeness: Completeness
): ScoreBreakdown {
  const { comparisons, findings } = result;

  const objectParity = parity(comparisons, [
    "address",
    "address-group",
    "dynamic-address-group",
    "service",
    "service-group",
  ]);
  const securityPolicyParity = parity(comparisons, ["security-rule"]);
  const natPolicyParity = parity(comparisons, ["nat-rule"]);
  const decryptionPolicyParity = parity(comparisons, ["decryption-rule"]);
  const otherPolicyParity = parity(comparisons, [
    "authentication-rule",
    "pbf-rule",
    "qos-rule",
    "dos-rule",
    "tunnel-inspection-rule",
    "sdwan-rule",
    "application-override-rule",
  ]);

  const dependencyIntegrity = penaltyScore(findings, ["dependency."]);
  const ruleOrderIntegrity = penaltyScore(findings, ["order."]);
  const securityRegression = penaltyScore(findings, ["regression.security"]);

  const deploymentVerification = completeness.targetRetrieved
    ? penaltyScore(findings, ["deployment."])
    : null;
  const behavioralTest = completeness.policyTestsCompleted
    ? penaltyScore(findings, ["test."])
    : null;

  // §23 weights. Components with no data are dropped and the remaining weights
  // renormalized, so an offline validation is not penalised for what it cannot
  // check — the completeness indicator communicates that instead.
  const weighted: [number | null, number][] = [
    [securityPolicyParity, 25],
    [natPolicyParity, 20],
    [combine(objectParity, dependencyIntegrity), 15],
    [ruleOrderIntegrity, 10],
    [deploymentVerification, 10],
    [behavioralTest, 10],
    [combine(decryptionPolicyParity, otherPolicyParity), 5],
    [securityRegression, 5],
  ];

  let total = 0;
  let weightSum = 0;
  for (const [value, weight] of weighted) {
    if (value === null) continue;
    total += value * weight;
    weightSum += weight;
  }
  const overall = weightSum ? round(total / weightSum) : 0;

  return {
    objectParity,
    securityPolicyParity,
    natPolicyParity,
    decryptionPolicyParity,
    otherPolicyParity,
    dependencyIntegrity,
    ruleOrderIntegrity,
    deploymentVerification,
    behavioralTest,
    securityRegression,
    overall,
    band: bandFor(overall),
  };
}

function combine(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return round((a + b) / 2);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Final recommendation for the sign-off report (§28). */
export function finalRecommendation(
  scores: ScoreBreakdown,
  openCritical: number,
  acceptedExceptions: number
):
  | "Approved for Production"
  | "Approved with Accepted Exceptions"
  | "Conditional Approval"
  | "Remediation Required"
  | "Validation Failed" {
  if (openCritical > 0) {
    return scores.overall < 50 ? "Validation Failed" : "Remediation Required";
  }
  if (scores.overall >= 95) {
    return acceptedExceptions > 0 ? "Approved with Accepted Exceptions" : "Approved for Production";
  }
  if (scores.overall >= 85) return "Approved with Accepted Exceptions";
  if (scores.overall >= 70) return "Conditional Approval";
  if (scores.overall >= 50) return "Remediation Required";
  return "Validation Failed";
}
