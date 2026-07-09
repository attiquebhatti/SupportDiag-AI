import type { ParserArtifact } from "../parsers/types";
import { Rule, Finding, Severity } from "./types";
import { allRules, runRuleSet } from "./engine";
import { systemHealthRules } from "./system-health";
import { panoramaRuleSet } from "./panorama-rules";
import { cortexRuleSet } from "./cortex-rules";
import { genericRuleSet } from "./generic-rules";

// DiagnosticRuleRegistry — maps a detected product id to the rule set to run.
// PAN-OS uses the full mature rule set; Panorama uses Panorama rules + system
// health; Cortex uses generic Cortex rules; Phase-2 vendors use generic rules.

export const RULE_REGISTRY: Record<string, Rule[]> = {
  panos_ngfw: allRules,
  panorama: [...panoramaRuleSet, ...systemHealthRules],
  cortex_xdr: [...cortexRuleSet, ...genericRuleSet],
  cortex_xsiam: [...cortexRuleSet, ...genericRuleSet],
  cp_gateway: genericRuleSet,
  cp_management: genericRuleSet,
  cp_maestro_vsx: genericRuleSet,
  fortigate: genericRuleSet,
  fortimanager: genericRuleSet,
  fortianalyzer: genericRuleSet,
};

/** Run the rule set for a detected product, with a safe fallback. */
export function runRulesForProduct(product: string | null, artifacts: ParserArtifact[]): Finding[] {
  const rules = (product && RULE_REGISTRY[product]) || [...allRules, ...genericRuleSet];
  return runRuleSet(rules, artifacts);
}

// Catalog metadata for the DiagnosticRule seed + Vendor Parsers / rules pages.
export interface RuleCatalogEntry {
  ruleId: string;
  vendor: string;
  product: string;
  category: string;
  severity: string;
  title: string;
  maturity: string;
}

function catalogFrom(rules: Rule[], vendor: string, product: string, maturity: string): RuleCatalogEntry[] {
  // Rules don't carry a default severity/title until evaluated, so we derive a
  // stable catalog from their id/category. Titles are looked up from a map below.
  return rules.map((r) => ({
    ruleId: r.id,
    vendor,
    product,
    category: r.category,
    severity: RULE_SEVERITY_HINT[r.id] ?? "Medium",
    title: RULE_TITLE_HINT[r.id] ?? r.id,
    maturity,
  }));
}

// Lightweight hints so the registry/seed can show severity+title without running.
const RULE_SEVERITY_HINT: Record<string, string> = {};
const RULE_TITLE_HINT: Record<string, string> = {};

export const RULE_CATALOG: RuleCatalogEntry[] = [
  ...catalogFrom(allRules, "palo_alto", "panos_ngfw", "high"),
  ...catalogFrom(panoramaRuleSet, "palo_alto", "panorama", "medium"),
  ...catalogFrom(cortexRuleSet, "palo_alto", "cortex_xdr", "low"),
  ...catalogFrom(genericRuleSet, "palo_alto", "cortex_xsiam", "low"),
  ...catalogFrom(genericRuleSet, "check_point", "cp_gateway", "low"),
  ...catalogFrom(genericRuleSet, "fortinet", "fortigate", "low"),
];

// De-duplicate catalog by ruleId (rules shared across products appear once).
export const RULE_CATALOG_UNIQUE: RuleCatalogEntry[] = Array.from(
  new Map(RULE_CATALOG.map((r) => [r.ruleId, r])).values()
);
