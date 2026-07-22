// Shared result types for the three-way comparison engine (§3).

import type {
  ComparisonStatus,
  FindingCategory,
  MappingType,
  RiskClassification,
  Severity,
} from "@prisma/client";
import type { NormalizedEntity } from "../types";

/** How a single field changed across the migration. */
export type FieldVerdict =
  | "same"
  | "equivalent"
  | "changed"
  | "broadened"
  | "narrowed"
  | "lost"
  | "added";

export interface FieldDiff {
  field: string;
  source?: unknown;
  migrated?: unknown;
  target?: unknown;
  verdict: FieldVerdict;
  /** Why this verdict was reached, shown verbatim in the UI. */
  note?: string;
}

/** One entity's full three-way outcome. */
export interface EntityComparison {
  objectType: string;
  policyType?: string;
  name: string;
  scope: string;
  sourceToMigrated: ComparisonStatus;
  migratedToDeployed: ComparisonStatus;
  endToEnd: ComparisonStatus;
  risk: RiskClassification;
  mappingType: MappingType;
  differences: FieldDiff[];
  sourceOrder?: number;
  migratedOrder?: number;
  targetOrder?: number;
  transformationNotes: string[];
  confidence: number;
}

export interface RemediationStep {
  step: number;
  action: string;
  /** Safe PAN-OS `set` command, when one can be generated deterministically. */
  cli?: string;
}

/** A finding before it is persisted. */
export interface FindingDraft {
  category: FindingCategory;
  severity: Severity;
  findingType: string;
  title: string;
  description: string;
  entityType?: string;
  entityName?: string;
  sourceEvidence?: unknown;
  migratedEvidence?: unknown;
  targetEvidence?: unknown;
  impact?: string;
  recommendation?: string;
  remediation?: RemediationStep[];
}

/** Everything a validation run produces. */
export interface ComparisonResult {
  comparisons: EntityComparison[];
  findings: FindingDraft[];
  /** Present only when the deployed target configuration was supplied. */
  targetProvided: boolean;
}

/** A matched pair across two configurations. */
export interface MatchPair {
  a?: NormalizedEntity;
  b?: NormalizedEntity;
  /** True when matched by value rather than by name (i.e. renamed). */
  renamed: boolean;
}

// --- Verdict helpers -------------------------------------------------------

const STATUS_RANK: Record<string, number> = {
  EXACT_MATCH: 0,
  EQUIVALENT_MATCH: 1,
  TRANSFORMED_MATCH: 2,
  PARTIAL_MATCH: 3,
  REQUIRES_MANUAL_REVIEW: 4,
  UNSUPPORTED: 5,
  EXTRA_IN_TARGET: 6,
  CONFLICT: 7,
  MISSING_IN_TARGET: 8,
  MISSING_IN_MIGRATED: 9,
  NOT_EVALUATED: 10,
};

/** The worse (higher-risk) of two statuses wins the end-to-end verdict. */
export function worstStatus(a: ComparisonStatus, b: ComparisonStatus): ComparisonStatus {
  if (a === "NOT_EVALUATED") return b;
  if (b === "NOT_EVALUATED") return a;
  return (STATUS_RANK[a] ?? 0) >= (STATUS_RANK[b] ?? 0) ? a : b;
}

const RISK_RANK: Record<string, number> = {
  NO_MATERIAL_CHANGE: 0,
  LOW_RISK_DIFFERENCE: 1,
  FUNCTIONAL_DIFFERENCE: 2,
  CONNECTIVITY_RISK: 3,
  SECURITY_WEAKENING: 4,
  CRITICAL_MIGRATION_FAILURE: 5,
};

export function worstRisk(a: RiskClassification, b: RiskClassification): RiskClassification {
  return (RISK_RANK[a] ?? 0) >= (RISK_RANK[b] ?? 0) ? a : b;
}

/** True when a status represents a successfully carried-over entity. */
export function isMatched(s: ComparisonStatus): boolean {
  return s === "EXACT_MATCH" || s === "EQUIVALENT_MATCH" || s === "TRANSFORMED_MATCH";
}
