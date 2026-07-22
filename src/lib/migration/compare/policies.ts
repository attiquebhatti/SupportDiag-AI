// Field-level policy comparison for Security (§6), NAT (§7) and Decryption (§8).
//
// Everything here operates on normalized entities, so the same logic serves the
// source->migrated hop (cross-vendor) and the migrated->deployed hop (PAN-OS to
// PAN-OS). Risk classification is action-aware: broadening an allow rule weakens
// security, while broadening a deny rule threatens connectivity instead.

import type { ComparisonStatus, RiskClassification } from "@prisma/client";
import {
  type DecryptionRuleEntity,
  type NatRuleEntity,
  type SecurityRuleEntity,
  isAny,
  normalizeMembers,
} from "../types";
import { type FieldDiff, worstRisk } from "./types";

function setsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isSuperset(sup: string[], sub: string[]): boolean {
  const s = new Set(sup);
  return sub.every((v) => s.has(v));
}

/** Compare a match-criteria list, classifying the direction of any change. */
function diffList(field: string, aVals: string[], bVals: string[]): FieldDiff {
  const a = normalizeMembers(aVals);
  const b = normalizeMembers(bVals);
  const base = { field, source: aVals, migrated: bVals };

  if (setsEqual(a, b)) return { ...base, verdict: "same" };
  if (isAny(b) && !isAny(a)) {
    return { ...base, verdict: "broadened", note: `${field} widened to "any"` };
  }
  if (isAny(a) && !isAny(b)) {
    return { ...base, verdict: "narrowed", note: `${field} narrowed from "any"` };
  }
  if (a.length && !b.length) return { ...base, verdict: "lost", note: `${field} removed` };
  if (!a.length && b.length) return { ...base, verdict: "added" };
  if (isSuperset(b, a)) return { ...base, verdict: "broadened", note: `${field} gained members` };
  if (isSuperset(a, b)) return { ...base, verdict: "narrowed", note: `${field} lost members` };
  return { ...base, verdict: "changed" };
}

function diffScalar(field: string, a: unknown, b: unknown, note?: string): FieldDiff {
  const same = String(a ?? "") === String(b ?? "");
  return { field, source: a, migrated: b, verdict: same ? "same" : "changed", note: same ? undefined : note };
}

/** Match criteria whose widening/narrowing carries real security meaning. */
const CRITERIA_FIELDS = new Set([
  "sources",
  "destinations",
  "applications",
  "services",
  "sourceUsers",
  "fromZones",
  "toZones",
  "urlCategories",
]);

/**
 * Turn a field change into a risk level, taking the rule's action into account.
 * A permissive rule that matches more traffic is a security problem; a blocking
 * rule that matches more traffic is a connectivity problem.
 */
function riskForDiff(d: FieldDiff, action: string): RiskClassification {
  const permissive = action === "allow";
  if (d.verdict === "same") return "NO_MATERIAL_CHANGE";

  if (CRITERIA_FIELDS.has(d.field)) {
    if (d.verdict === "broadened" || d.verdict === "lost") {
      return permissive ? "SECURITY_WEAKENING" : "CONNECTIVITY_RISK";
    }
    if (d.verdict === "narrowed") {
      return permissive ? "CONNECTIVITY_RISK" : "FUNCTIONAL_DIFFERENCE";
    }
    return "FUNCTIONAL_DIFFERENCE";
  }

  switch (d.field) {
    case "action":
      // allow -> deny breaks traffic; deny -> allow removes a control.
      return String(d.migrated) === "allow" ? "SECURITY_WEAKENING" : "CONNECTIVITY_RISK";
    case "profileSetting":
      return "SECURITY_WEAKENING";
    case "enabled":
      return d.migrated === true ? "SECURITY_WEAKENING" : "CONNECTIVITY_RISK";
    case "logEnd":
    case "logStart":
    case "logSetting":
      return "SECURITY_WEAKENING";
    case "negateSource":
    case "negateDestination":
      return "FUNCTIONAL_DIFFERENCE";
    case "description":
    case "tags":
      return "LOW_RISK_DIFFERENCE";
    default:
      return "FUNCTIONAL_DIFFERENCE";
  }
}

export interface PolicyDiffResult {
  diffs: FieldDiff[];
  risk: RiskClassification;
}

/** Describe a profile attachment compactly for diffing and evidence. */
function profileLabel(p: SecurityRuleEntity["profileSetting"]): string {
  if (p.none) return "none";
  if (p.group) return `group:${p.group}`;
  if (p.profiles) {
    return Object.entries(p.profiles)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join(",");
  }
  return "none";
}

export function compareSecurity(
  a: SecurityRuleEntity,
  b: SecurityRuleEntity
): PolicyDiffResult {
  const diffs: FieldDiff[] = [
    diffList("fromZones", a.fromZones, b.fromZones),
    diffList("toZones", a.toZones, b.toZones),
    diffList("sources", a.sources, b.sources),
    diffList("destinations", a.destinations, b.destinations),
    diffList("sourceUsers", a.sourceUsers, b.sourceUsers),
    diffList("applications", a.applications, b.applications),
    diffList("services", a.services, b.services),
    diffList("urlCategories", a.urlCategories, b.urlCategories),
    diffList("hipProfiles", a.hipProfiles, b.hipProfiles),
    diffList("tags", a.tags, b.tags),
    diffScalar("action", a.action, b.action, "rule action changed"),
    diffScalar("enabled", a.enabled, b.enabled, "enabled state changed"),
    diffScalar("logStart", a.logStart, b.logStart),
    diffScalar("logEnd", a.logEnd, b.logEnd, "session-end logging changed"),
    diffScalar("logSetting", a.logSetting, b.logSetting),
    diffScalar("schedule", a.schedule, b.schedule),
    diffScalar("ruleType", a.ruleType, b.ruleType),
    diffScalar("negateSource", a.negateSource, b.negateSource),
    diffScalar("negateDestination", a.negateDestination, b.negateDestination),
    diffScalar("description", a.description, b.description),
    diffScalar(
      "profileSetting",
      profileLabel(a.profileSetting),
      profileLabel(b.profileSetting),
      "threat inspection profiles changed"
    ),
    diffScalar("placement", a.placement, b.placement, "rulebase placement changed"),
    diffScalar("scope", a.scope, b.scope, "rule scope changed"),
  ];

  // Profile removal is the classic silent regression, so state it plainly.
  const prof = diffs.find((d) => d.field === "profileSetting");
  if (prof && prof.verdict !== "same" && profileLabel(b.profileSetting) === "none") {
    prof.verdict = "lost";
    prof.note = "all threat inspection profiles removed";
  }

  let risk: RiskClassification = "NO_MATERIAL_CHANGE";
  for (const d of diffs) risk = worstRisk(risk, riskForDiff(d, b.action));
  return { diffs: diffs.filter((d) => d.verdict !== "same"), risk };
}

/**
 * Compact signature of the packet transformation a NAT rule performs. Comparing
 * intent rather than field names catches equivalent rules written differently.
 */
export function natIntent(r: NatRuleEntity): string {
  const st = r.sourceTranslation;
  const src =
    st.kind === "none"
      ? "src:none"
      : `src:${st.kind}:${st.interfaceName ?? normalizeMembers(st.translatedAddresses).join("+")}${st.bidirectional ? ":bidir" : ""}`;
  const dt = r.destinationTranslation;
  const dst = dt
    ? `dst:${dt.translatedAddress ?? "-"}:${dt.translatedPort ?? "-"}${dt.dnsRewrite ? `:dns=${dt.dnsRewrite}` : ""}`
    : "dst:none";
  return `${src}|${dst}`;
}

export function compareNat(a: NatRuleEntity, b: NatRuleEntity): PolicyDiffResult {
  const diffs: FieldDiff[] = [
    diffList("fromZones", a.fromZones, b.fromZones),
    diffList("toZones", a.toZones, b.toZones),
    diffList("sources", a.sources, b.sources),
    diffList("destinations", a.destinations, b.destinations),
    diffList("services", a.services, b.services),
    diffList("tags", a.tags, b.tags),
    diffScalar("destinationInterface", a.destinationInterface, b.destinationInterface),
    diffScalar("enabled", a.enabled, b.enabled, "enabled state changed"),
    diffScalar("description", a.description, b.description),
    diffScalar("placement", a.placement, b.placement),
    diffScalar("scope", a.scope, b.scope),
    diffScalar(
      "translationIntent",
      natIntent(a),
      natIntent(b),
      "the packet transformation this rule performs changed"
    ),
    diffScalar("sourceTranslationKind", a.sourceTranslation.kind, b.sourceTranslation.kind),
    diffScalar(
      "bidirectional",
      a.sourceTranslation.bidirectional,
      b.sourceTranslation.bidirectional,
      "bi-directional NAT setting changed"
    ),
    diffScalar(
      "translatedPort",
      a.destinationTranslation?.translatedPort,
      b.destinationTranslation?.translatedPort,
      "destination port translation changed"
    ),
    diffScalar("isNoNat", a.isNoNat, b.isNoNat, "no-NAT exemption behaviour changed"),
  ];

  let risk: RiskClassification = "NO_MATERIAL_CHANGE";
  for (const d of diffs) {
    if (d.verdict === "same") continue;
    // Any change to what the rule actually does to the packet is functional.
    if (
      d.field === "translationIntent" ||
      d.field === "sourceTranslationKind" ||
      d.field === "translatedPort" ||
      d.field === "destinationInterface"
    ) {
      risk = worstRisk(risk, "CONNECTIVITY_RISK");
    } else if (d.field === "isNoNat" || d.field === "bidirectional") {
      risk = worstRisk(risk, "CONNECTIVITY_RISK");
    } else if (CRITERIA_FIELDS.has(d.field)) {
      risk = worstRisk(risk, d.verdict === "broadened" ? "FUNCTIONAL_DIFFERENCE" : "CONNECTIVITY_RISK");
    } else if (d.field === "enabled") {
      risk = worstRisk(risk, "CONNECTIVITY_RISK");
    } else {
      risk = worstRisk(risk, "LOW_RISK_DIFFERENCE");
    }
  }
  return { diffs: diffs.filter((d) => d.verdict !== "same"), risk };
}

export function compareDecryption(
  a: DecryptionRuleEntity,
  b: DecryptionRuleEntity
): PolicyDiffResult {
  const diffs: FieldDiff[] = [
    diffList("fromZones", a.fromZones, b.fromZones),
    diffList("toZones", a.toZones, b.toZones),
    diffList("sources", a.sources, b.sources),
    diffList("destinations", a.destinations, b.destinations),
    diffList("sourceUsers", a.sourceUsers, b.sourceUsers),
    diffList("services", a.services, b.services),
    diffList("urlCategories", a.urlCategories, b.urlCategories),
    diffScalar("action", a.action, b.action, "decryption action changed"),
    diffScalar("decryptionType", a.decryptionType, b.decryptionType),
    diffScalar("profile", a.profile, b.profile, "decryption profile changed"),
    diffScalar("certificate", a.certificate, b.certificate, "certificate reference changed"),
    diffScalar("enabled", a.enabled, b.enabled),
    diffScalar("placement", a.placement, b.placement),
  ];

  let risk: RiskClassification = "NO_MATERIAL_CHANGE";
  for (const d of diffs) {
    if (d.verdict === "same") continue;
    if (d.field === "action") {
      // Losing a no-decrypt exemption has privacy and breakage consequences.
      risk = worstRisk(
        risk,
        String(d.migrated) === "decrypt" ? "SECURITY_WEAKENING" : "FUNCTIONAL_DIFFERENCE"
      );
    } else if (d.field === "certificate" || d.field === "profile") {
      risk = worstRisk(risk, "CONNECTIVITY_RISK");
    } else if (CRITERIA_FIELDS.has(d.field)) {
      risk = worstRisk(risk, "FUNCTIONAL_DIFFERENCE");
    } else {
      risk = worstRisk(risk, "LOW_RISK_DIFFERENCE");
    }
  }
  return { diffs: diffs.filter((d) => d.verdict !== "same"), risk };
}

/** Derive a comparison status from the differences found on a matched pair. */
export function statusFromDiffs(diffs: FieldDiff[], renamed: boolean): ComparisonStatus {
  if (diffs.length === 0) return renamed ? "EQUIVALENT_MATCH" : "EXACT_MATCH";
  const cosmeticOnly = diffs.every(
    (d) => d.field === "description" || d.field === "tags" || d.field === "scope"
  );
  if (cosmeticOnly) return "EQUIVALENT_MATCH";
  const onlyTransform = diffs.every((d) => d.verdict === "equivalent");
  if (onlyTransform) return "TRANSFORMED_MATCH";
  return "PARTIAL_MATCH";
}
