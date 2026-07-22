// Three-way comparison orchestrator (§3, §36).
//
// Pipeline: match entities across both hops, compare them field by field, then
// derive findings. The migrated configuration is the pivot — source->migrated
// answers "did the migration translate it?", migrated->deployed answers "did it
// actually land on the device?", and the two combine into the end-to-end verdict.

import type { ComparisonStatus, RiskClassification, Severity } from "@prisma/client";
import {
  type NormalizedConfig,
  type NormalizedEntity,
  type SecurityRuleEntity,
  isPolicyType,
} from "../types";
import { matchEntities, ofType } from "./match";
import { compareObjects, validateDependencies } from "./objects";
import { analyzeOrderChanges, detectShadowing, rulebaseKey, toOrderedRules } from "./order";
import {
  type PolicyDiffResult,
  compareDecryption,
  compareNat,
  compareSecurity,
  statusFromDiffs,
} from "./policies";
import {
  type ComparisonResult,
  type EntityComparison,
  type FindingDraft,
  isMatched,
  worstRisk,
  worstStatus,
} from "./types";

/** Entity types compared in Phase 1. Others are recorded but not deep-compared. */
const COMPARED_TYPES = [
  "address",
  "address-group",
  "dynamic-address-group",
  "service",
  "service-group",
  "security-rule",
  "nat-rule",
  "decryption-rule",
];

function comparePair(a: NormalizedEntity, b: NormalizedEntity): PolicyDiffResult {
  switch (a.objectType) {
    case "security-rule":
      return b.objectType === "security-rule"
        ? compareSecurity(a as SecurityRuleEntity, b as SecurityRuleEntity)
        : { diffs: [], risk: "FUNCTIONAL_DIFFERENCE" };
    case "nat-rule":
      return b.objectType === "nat-rule"
        ? compareNat(a as never, b as never)
        : { diffs: [], risk: "FUNCTIONAL_DIFFERENCE" };
    case "decryption-rule":
      return b.objectType === "decryption-rule"
        ? compareDecryption(a as never, b as never)
        : { diffs: [], risk: "FUNCTIONAL_DIFFERENCE" };
    default:
      return compareObjects(a, b);
  }
}

const RISK_SEVERITY: Record<RiskClassification, Severity> = {
  NO_MATERIAL_CHANGE: "INFORMATIONAL",
  LOW_RISK_DIFFERENCE: "LOW",
  FUNCTIONAL_DIFFERENCE: "MEDIUM",
  CONNECTIVITY_RISK: "HIGH",
  SECURITY_WEAKENING: "HIGH",
  CRITICAL_MIGRATION_FAILURE: "CRITICAL",
};

export interface CompareInput {
  source?: NormalizedConfig;
  migrated?: NormalizedConfig;
  target?: NormalizedConfig;
}

export function runComparison(input: CompareInput): ComparisonResult {
  const { source, migrated, target } = input;
  const comparisons: EntityComparison[] = [];
  const findings: FindingDraft[] = [];
  const targetProvided = !!target;

  for (const objectType of COMPARED_TYPES) {
    const src = source ? ofType(source.entities, objectType) : [];
    const mig = migrated ? ofType(migrated.entities, objectType) : [];
    const tgt = target ? ofType(target.entities, objectType) : [];

    // Hop 1: source -> migrated, keyed by the migrated entity.
    const sourceOf = new Map<NormalizedEntity, { entity?: NormalizedEntity; renamed: boolean }>();
    const missingInMigrated: NormalizedEntity[] = [];
    if (source && migrated) {
      for (const p of matchEntities(src, mig)) {
        if (p.b) sourceOf.set(p.b, { entity: p.a, renamed: p.renamed });
        else if (p.a) missingInMigrated.push(p.a);
      }
    }

    // Hop 2: migrated -> deployed, keyed by the migrated entity.
    const targetOf = new Map<NormalizedEntity, { entity?: NormalizedEntity; renamed: boolean }>();
    const extraInTarget: NormalizedEntity[] = [];
    if (migrated && target) {
      for (const p of matchEntities(mig, tgt)) {
        if (p.a) targetOf.set(p.a, { entity: p.b, renamed: p.renamed });
        else if (p.b) extraInTarget.push(p.b);
      }
    }

    // Entities that exist in the migration output.
    for (const m of mig) {
      const sm = sourceOf.get(m);
      const md = targetOf.get(m);

      let sourceToMigrated: ComparisonStatus = "NOT_EVALUATED";
      let risk: RiskClassification = "NO_MATERIAL_CHANGE";
      let diffs: EntityComparison["differences"] = [];
      const notes: string[] = [];

      if (source) {
        if (sm?.entity) {
          const r = comparePair(sm.entity, m);
          diffs = r.diffs;
          risk = r.risk;
          sourceToMigrated = statusFromDiffs(r.diffs, sm.renamed);
          if (sm.renamed) {
            notes.push(`Renamed from "${sm.entity.name}" to "${m.name}"`);
          }
        } else {
          // Present in the migration output but absent from the source.
          sourceToMigrated = "EXTRA_IN_TARGET";
          risk = "LOW_RISK_DIFFERENCE";
          notes.push("No corresponding entity in the source configuration");
        }
      }

      let migratedToDeployed: ComparisonStatus = "NOT_EVALUATED";
      if (target) {
        if (md?.entity) {
          const r = comparePair(m, md.entity);
          migratedToDeployed = statusFromDiffs(r.diffs, md.renamed);
          risk = worstRisk(risk, r.risk);
          // Deployment drift is reported against the deployed value.
          for (const d of r.diffs) {
            diffs.push({ ...d, target: d.migrated, migrated: d.source, source: undefined });
          }
          if (r.diffs.length) {
            notes.push("Deployed configuration differs from the migration output");
          }
        } else {
          migratedToDeployed = "MISSING_IN_TARGET";
          risk = worstRisk(risk, "CRITICAL_MIGRATION_FAILURE");
        }
      }

      const endToEnd = worstStatus(sourceToMigrated, migratedToDeployed);
      comparisons.push({
        objectType,
        policyType: isPolicyType(objectType) ? objectType : undefined,
        name: m.name,
        scope: m.scope,
        sourceToMigrated,
        migratedToDeployed,
        endToEnd,
        risk,
        mappingType: sm?.renamed ? "TRANSFORMED_OBJECT" : sm?.entity ? "ONE_TO_ONE" : "UNMAPPED",
        differences: diffs,
        sourceOrder: (sm?.entity as { order?: number } | undefined)?.order,
        migratedOrder: (m as { order?: number }).order,
        targetOrder: (md?.entity as { order?: number } | undefined)?.order,
        transformationNotes: notes,
        confidence: sm?.renamed ? 85 : 100,
      });

      if (migratedToDeployed === "MISSING_IN_TARGET") {
        findings.push({
          category: "DEPLOYMENT_FAILURE",
          severity: "CRITICAL",
          findingType: "deployment.missing-on-target",
          title: `${labelType(objectType)} "${m.name}" was generated but is not on the target`,
          description: `"${m.name}" exists in the migration output but was not found in the deployed target configuration. It was either never pushed, removed after migration, or rejected during commit.`,
          entityType: objectType,
          entityName: m.name,
          migratedEvidence: summarize(m),
          impact: isPolicyType(objectType)
            ? "The intended policy is not enforced on the device."
            : "Rules depending on this object cannot resolve it.",
          recommendation:
            "Confirm the commit/push succeeded for this scope, then re-run validation. If the push reported errors, resolve them and redeploy.",
        });
      }

      if (diffs.length && risk !== "NO_MATERIAL_CHANGE" && risk !== "LOW_RISK_DIFFERENCE") {
        findings.push(diffFinding(objectType, m.name, risk, diffs, sm?.entity, m, md?.entity));
      }
    }

    // Source entities that never made it into the migration output.
    for (const s of missingInMigrated) {
      comparisons.push({
        objectType,
        policyType: isPolicyType(objectType) ? objectType : undefined,
        name: s.name,
        scope: s.scope,
        sourceToMigrated: "MISSING_IN_MIGRATED",
        migratedToDeployed: "NOT_EVALUATED",
        endToEnd: "MISSING_IN_MIGRATED",
        risk: "CRITICAL_MIGRATION_FAILURE",
        mappingType: "UNMAPPED",
        differences: [],
        sourceOrder: (s as { order?: number }).order,
        transformationNotes: [],
        confidence: 100,
      });
      findings.push({
        category: "MIGRATION_FAILURE",
        severity: "CRITICAL",
        findingType: "migration.missing-entity",
        title: `${labelType(objectType)} "${s.name}" was not migrated`,
        description: `"${s.name}" exists in the source configuration but has no counterpart in the migration output, under either its original name or an equivalent value.`,
        entityType: objectType,
        entityName: s.name,
        sourceEvidence: summarize(s),
        impact: isPolicyType(objectType)
          ? "Traffic this rule permitted or blocked is no longer handled as intended."
          : "Any rule that referenced this object cannot be migrated faithfully.",
        recommendation: `Re-run the migration for "${s.name}", or record it as an intentional omission with justification.`,
      });
    }

    // Entities present on the device that the migration never produced.
    for (const t of extraInTarget) {
      comparisons.push({
        objectType,
        policyType: isPolicyType(objectType) ? objectType : undefined,
        name: t.name,
        scope: t.scope,
        sourceToMigrated: "NOT_EVALUATED",
        migratedToDeployed: "EXTRA_IN_TARGET",
        endToEnd: "EXTRA_IN_TARGET",
        risk: "FUNCTIONAL_DIFFERENCE",
        mappingType: "UNMAPPED",
        differences: [],
        targetOrder: (t as { order?: number }).order,
        transformationNotes: ["Exists on the target but not in the migration output"],
        confidence: 100,
      });
      findings.push({
        category: "MIGRATION_DIFFERENCE",
        severity: isPolicyType(objectType) ? "HIGH" : "MEDIUM",
        findingType: "deployment.extra-on-target",
        title: `Unexpected ${labelType(objectType).toLowerCase()} "${t.name}" on the target`,
        description: `"${t.name}" exists in the deployed configuration but was not produced by the migration. It was likely added manually after the migration, or pre-existed on the device.`,
        entityType: objectType,
        entityName: t.name,
        targetEvidence: summarize(t),
        impact: isPolicyType(objectType)
          ? "An unreviewed rule is being enforced, and it may shadow migrated rules."
          : "An unreviewed object exists in the target configuration.",
        recommendation:
          "Confirm with the administrator whether this was an intentional post-migration change, then accept it as an exception or remove it.",
      });
    }
  }

  // Dependency integrity, per configuration.
  if (migrated) findings.push(...validateDependencies(migrated, "the migration output"));
  if (target) findings.push(...validateDependencies(target, "the deployed target"));

  // Order and shadowing, per rulebase.
  findings.push(...orderFindings(source, migrated, "the migration output"));
  if (target) findings.push(...orderFindings(migrated, target, "the deployed target"));

  const shadowSource = target ?? migrated;
  if (shadowSource) {
    const rules = ofType(shadowSource.entities, "security-rule") as SecurityRuleEntity[];
    const byBase = new Map<string, SecurityRuleEntity[]>();
    for (const r of rules) {
      const k = rulebaseKey(r);
      const list = byBase.get(k);
      if (list) list.push(r);
      else byBase.set(k, [r]);
    }
    for (const [, group] of byBase) {
      findings.push(
        ...detectShadowing(group, target ? "the deployed target" : "the migration output")
      );
    }
  }

  return { comparisons, findings, targetProvided };
}

function orderFindings(
  before: NormalizedConfig | undefined,
  after: NormalizedConfig | undefined,
  label: string
): FindingDraft[] {
  if (!before || !after) return [];
  const out: FindingDraft[] = [];
  const b = toOrderedRules(ofType(before.entities, "security-rule") as SecurityRuleEntity[]);
  const a = toOrderedRules(ofType(after.entities, "security-rule") as SecurityRuleEntity[]);

  // Compare each rulebase independently; cross-rulebase moves are scope changes,
  // reported by the field comparison rather than as reordering.
  const keys = new Set([...a.map(rulebaseKey), ...b.map(rulebaseKey)]);
  for (const k of keys) {
    const bb = b.filter((r) => rulebaseKey(r) === k).sort((x, y) => x.order - y.order);
    const aa = a.filter((r) => rulebaseKey(r) === k).sort((x, y) => x.order - y.order);
    if (!bb.length || !aa.length) continue;
    out.push(...analyzeOrderChanges(bb, aa, `${label} (${k})`));
  }
  return out;
}

function diffFinding(
  objectType: string,
  name: string,
  risk: RiskClassification,
  diffs: EntityComparison["differences"],
  sourceEntity: NormalizedEntity | undefined,
  migratedEntity: NormalizedEntity,
  targetEntity: NormalizedEntity | undefined
): FindingDraft {
  const security = risk === "SECURITY_WEAKENING";
  const connectivity = risk === "CONNECTIVITY_RISK";
  const summary = diffs
    .slice(0, 4)
    .map((d) => `${d.field}: ${d.note ?? d.verdict}`)
    .join("; ");

  return {
    category: security
      ? "SECURITY_REGRESSION"
      : connectivity
        ? "CONNECTIVITY_RISK"
        : "MIGRATION_DIFFERENCE",
    severity: RISK_SEVERITY[risk],
    findingType: security
      ? "regression.security"
      : connectivity
        ? "regression.connectivity"
        : "migration.field-difference",
    title: `${labelType(objectType)} "${name}": ${summary}`,
    description: `Comparing "${name}" across the migration found ${diffs.length} field difference(s): ${diffs
      .map((d) => `${d.field} (${d.verdict}${d.note ? ` — ${d.note}` : ""})`)
      .join(", ")}.`,
    entityType: objectType,
    entityName: name,
    sourceEvidence: sourceEntity ? summarize(sourceEntity) : undefined,
    migratedEvidence: summarize(migratedEntity),
    targetEvidence: targetEntity ? summarize(targetEntity) : undefined,
    impact: security
      ? "The migrated rule permits more than the source intended, reducing the effective security posture."
      : connectivity
        ? "The migrated rule matches less traffic than the source intended, which may break legitimate flows."
        : "Behaviour differs from the source configuration.",
    recommendation: security
      ? "Restore the original match criteria or profile attachment, then re-validate."
      : "Review the differences and either correct the target or accept them as intentional.",
  };
}

function labelType(objectType: string): string {
  return objectType
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/** Compact, secret-free evidence snapshot stored with a finding. */
function summarize(e: NormalizedEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: e.name,
    objectType: e.objectType,
    scope: e.scope,
    enabled: e.enabled,
  };
  const any = e as unknown as Record<string, unknown>;
  for (const k of [
    "value",
    "members",
    "order",
    "placement",
    "action",
    "sources",
    "destinations",
    "applications",
    "services",
    "fromZones",
    "toZones",
    "profileSetting",
    "sourceTranslation",
    "destinationTranslation",
  ]) {
    if (any[k] !== undefined) out[k] = any[k];
  }
  return out;
}

export { isMatched };
