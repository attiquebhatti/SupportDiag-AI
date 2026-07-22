// Rule order and shadowing analysis (§10).
//
// Order matters more than field parity in a firewall: a perfectly migrated
// rule set evaluated in the wrong sequence produces different traffic outcomes.
//
// Shadowing here is name-based (a rule is shadowed when an earlier rule's match
// criteria are a literal superset). It deliberately does not attempt IP-space
// or App-ID subset maths, which would produce false positives without full
// object resolution; that analysis belongs with policy-match testing.

import { type SecurityRuleEntity, isAny, normalizeMembers } from "../types";
import type { FindingDraft } from "./types";

/** The subset of a rule needed for ordering questions. */
export interface OrderedRule {
  name: string;
  normalizedName: string;
  order: number;
  placement: string;
  scope: string;
  enabled: boolean;
  action?: string;
}

export function toOrderedRules(rules: SecurityRuleEntity[]): OrderedRule[] {
  return rules.map((r) => ({
    name: r.name,
    normalizedName: r.normalizedName,
    order: r.order,
    placement: r.placement,
    scope: r.scope,
    enabled: r.enabled,
    action: r.action,
  }));
}

/** Group rules into their independent rulebases. */
export function rulebaseKey(r: { scope: string; placement: string }): string {
  return `${r.scope}|${r.placement}`;
}

/** Longest common subsequence of two name sequences. */
function lcs(a: string[], b: string[]): string[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

export interface OrderChange {
  name: string;
  fromPosition: number;
  toPosition: number;
}

/**
 * Report the minimal set of rules that moved. Rules outside the longest common
 * subsequence are the ones actually repositioned; everything else merely
 * shifted around them.
 */
export function detectOrderChanges(
  before: OrderedRule[],
  after: OrderedRule[]
): OrderChange[] {
  const beforeNames = before.map((r) => r.normalizedName);
  const afterNames = after.map((r) => r.normalizedName);
  const common = new Set(beforeNames.filter((n) => afterNames.includes(n)));

  const seqA = beforeNames.filter((n) => common.has(n));
  const seqB = afterNames.filter((n) => common.has(n));
  const stable = new Set(lcs(seqA, seqB));

  const changes: OrderChange[] = [];
  for (const name of common) {
    if (stable.has(name)) continue;
    const from = before.find((r) => r.normalizedName === name);
    const to = after.find((r) => r.normalizedName === name);
    if (!from || !to) continue;
    changes.push({
      name: to.name,
      fromPosition: seqA.indexOf(name) + 1,
      toPosition: seqB.indexOf(name) + 1,
    });
  }
  return changes;
}

/**
 * Turn order changes into findings, escalating when a moved rule crosses a rule
 * with the opposite action — the case that actually changes traffic outcomes.
 */
export function analyzeOrderChanges(
  before: OrderedRule[],
  after: OrderedRule[],
  label: string
): FindingDraft[] {
  const changes = detectOrderChanges(before, after);
  const findings: FindingDraft[] = [];

  for (const c of changes) {
    const moved = after.find((r) => r.name === c.name);
    if (!moved) continue;

    // Which rules did it cross, and do any have the opposite action?
    const crossed = after.filter((r) => {
      const beforeIdx = before.findIndex((x) => x.normalizedName === r.normalizedName);
      const afterIdx = after.findIndex((x) => x.normalizedName === r.normalizedName);
      if (beforeIdx < 0 || afterIdx < 0) return false;
      const movedBefore = before.findIndex((x) => x.normalizedName === moved.normalizedName);
      const movedAfter = after.findIndex((x) => x.normalizedName === moved.normalizedName);
      const wasAfter = beforeIdx > movedBefore;
      const nowBefore = afterIdx < movedAfter;
      return wasAfter && nowBefore;
    });

    const conflicting = crossed.filter(
      (r) => r.action && moved.action && r.action !== moved.action
    );

    const critical = conflicting.length > 0;
    findings.push({
      category: critical ? "MIGRATION_FAILURE" : "MIGRATION_DIFFERENCE",
      severity: critical ? "CRITICAL" : "MEDIUM",
      findingType: critical ? "order.critical-reorder" : "order.reordered",
      title: critical
        ? `Critical rule-order change: "${c.name}" now evaluates after conflicting rules`
        : `Rule "${c.name}" changed position`,
      description: critical
        ? `In ${label}, rule "${c.name}" (action ${moved.action}) moved from position ${c.fromPosition} to ${c.toPosition}, and is now preceded by ${conflicting
            .map((r) => `"${r.name}" (${r.action})`)
            .join(", ")}. Traffic may match the earlier rule first, producing a different outcome.`
        : `Rule "${c.name}" moved from position ${c.fromPosition} to ${c.toPosition} in ${label}. No rule with a conflicting action was crossed.`,
      entityType: "security-rule",
      entityName: c.name,
      impact: critical
        ? "Traffic that previously matched this rule may now be handled by a rule with the opposite action."
        : "Evaluation order changed, but no conflicting action was crossed.",
      recommendation: critical
        ? `Restore "${c.name}" to its original relative position, or confirm the new order is intentional and record it as an accepted exception.`
        : "Confirm the new position is intentional.",
      sourceEvidence: { position: c.fromPosition },
      targetEvidence: { position: c.toPosition, precededBy: conflicting.map((r) => r.name) },
    });
  }
  return findings;
}

/** True when `wide` matches at least everything `narrow` matches. */
function covers(wide: string[], narrow: string[]): boolean {
  if (isAny(wide)) return true;
  if (isAny(narrow)) return false;
  const w = new Set(normalizeMembers(wide));
  return normalizeMembers(narrow).every((v) => w.has(v));
}

const SHADOW_DIMENSIONS: (keyof SecurityRuleEntity)[] = [
  "fromZones",
  "toZones",
  "sources",
  "destinations",
  "applications",
  "services",
  "sourceUsers",
];

/**
 * Detect rules made unreachable by an earlier rule in the same rulebase.
 * Only enabled rules participate; a disabled rule cannot shadow anything.
 */
export function detectShadowing(
  rules: SecurityRuleEntity[],
  label: string
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const active = rules.filter((r) => r.enabled).sort((a, b) => a.order - b.order);

  for (let j = 0; j < active.length; j++) {
    const narrow = active[j];
    for (let i = 0; i < j; i++) {
      const wide = active[i];
      const shadowed = SHADOW_DIMENSIONS.every((dim) =>
        covers(wide[dim] as string[], narrow[dim] as string[])
      );
      if (!shadowed) continue;

      const sameAction = wide.action === narrow.action;
      findings.push({
        category: sameAction ? "OPTIMIZATION_RECOMMENDATION" : "MIGRATION_FAILURE",
        severity: sameAction ? "LOW" : "HIGH",
        findingType: "order.shadowed-rule",
        title: `Rule "${narrow.name}" is shadowed by "${wide.name}"`,
        description: `In ${label}, rule "${wide.name}" at position ${wide.order} matches everything rule "${narrow.name}" at position ${narrow.order} would match, so "${narrow.name}" never evaluates.${
          sameAction
            ? " Both rules use the same action, so traffic handling is unchanged."
            : ` The actions differ (${wide.action} vs ${narrow.action}), so traffic is handled differently than intended.`
        }`,
        entityType: "security-rule",
        entityName: narrow.name,
        impact: sameAction
          ? "No traffic impact; the shadowed rule is redundant."
          : `Traffic intended to be ${narrow.action}ed is instead ${wide.action}ed by the earlier rule.`,
        recommendation: sameAction
          ? `Remove the redundant rule "${narrow.name}".`
          : `Move "${narrow.name}" above "${wide.name}", or narrow "${wide.name}".`,
        sourceEvidence: { shadowingRule: wide.name, position: wide.order },
        targetEvidence: { shadowedRule: narrow.name, position: narrow.order },
      });
      break; // Report the first (earliest) shadowing rule only.
    }
  }
  return findings;
}
