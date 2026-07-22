// Migration Assurance engine tests (§34).
//
// Each fixture pair encodes one migration defect. The assertions check that the
// engine names the specific problem — not merely that "something differs" — and
// that a faithful migration is never reported as failed.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePanosXml } from "../../src/lib/migration/parsers/panos-xml";
import { runComparison } from "../../src/lib/migration/compare/engine";
import { computeScores } from "../../src/lib/migration/scoring";

function cfg(rules: string, objects = ""): string {
  return `<config version="10.2.0"><devices><entry name="localhost.localdomain"><vsys><entry name="vsys1">
    <address>
      <entry name="ERP-Servers"><ip-netmask>10.10.20.10/32</ip-netmask></entry>
      ${objects}
    </address>
    <rulebase><security><rules>${rules}</rules></security></rulebase>
  </entry></vsys></entry></devices></config>`;
}

const RULE_ERP = `<entry name="Allow-ERP-Outbound">
  <from><member>Trust</member></from><to><member>Untrust</member></to>
  <source><member>ERP-Servers</member></source><destination><member>any</member></destination>
  <application><member>ssl</member></application><service><member>application-default</member></service>
  <action>allow</action><log-end>yes</log-end>
  <profile-setting><group><member>Best-Practice</member></group></profile-setting>
</entry>`;

const RULE_CLEANUP = `<entry name="Cleanup-Deny">
  <from><member>any</member></from><to><member>any</member></to>
  <source><member>any</member></source><destination><member>any</member></destination>
  <application><member>any</member></application><service><member>any</member></service>
  <action>deny</action>
</entry>`;

const ALL_COMPLETENESS = {
  sourceProvided: true,
  migratedProvided: true,
  targetRetrieved: false,
  commitValidated: false,
  deploymentVerified: false,
  policyTestsCompleted: false,
  runtimeChecksCompleted: false,
};

test("identical configurations produce a clean, passing result", async () => {
  const xml = cfg(RULE_ERP + RULE_CLEANUP);
  const source = await parsePanosXml(xml);
  const migrated = await parsePanosXml(xml);
  const result = runComparison({ source, migrated });

  const failures = result.findings.filter(
    (f) => f.category === "MIGRATION_FAILURE" || f.category === "SECURITY_REGRESSION"
  );
  assert.equal(failures.length, 0, "a faithful migration must not report failures");

  const erp = result.comparisons.find((c) => c.name === "Allow-ERP-Outbound");
  assert.equal(erp?.sourceToMigrated, "EXACT_MATCH");
  assert.equal(erp?.endToEnd, "EXACT_MATCH");

  const scores = computeScores(result, ALL_COMPLETENESS);
  assert.ok(scores.securityPolicyParity === 100, `expected 100, got ${scores.securityPolicyParity}`);
});

test("renamed object with identical value is an equivalent match, not a loss", async () => {
  const source = await parsePanosXml(cfg(RULE_ERP));
  // Hyphen -> underscore is the classic migration-tool rewrite.
  const migrated = await parsePanosXml(
    cfg(RULE_ERP.replace("ERP-Servers", "ERP_Servers")).replace(
      'name="ERP-Servers"',
      'name="ERP_Servers"'
    )
  );
  const result = runComparison({ source, migrated });

  const missing = result.findings.filter((f) => f.findingType === "migration.missing-entity");
  assert.equal(missing.length, 0, "a renamed object must not be reported as missing");

  const addr = result.comparisons.find((c) => c.objectType === "address");
  assert.ok(
    addr && ["EXACT_MATCH", "EQUIVALENT_MATCH"].includes(addr.sourceToMigrated),
    `expected equivalent match, got ${addr?.sourceToMigrated}`
  );
});

test("missing security rule is reported as a critical migration failure", async () => {
  const source = await parsePanosXml(cfg(RULE_ERP + RULE_CLEANUP));
  const migrated = await parsePanosXml(cfg(RULE_ERP)); // Cleanup-Deny dropped
  const result = runComparison({ source, migrated });

  const missing = result.findings.find(
    (f) => f.findingType === "migration.missing-entity" && f.entityName === "Cleanup-Deny"
  );
  assert.ok(missing, "dropped rule must be reported");
  assert.equal(missing.severity, "CRITICAL");

  const comp = result.comparisons.find((c) => c.name === "Cleanup-Deny");
  assert.equal(comp?.endToEnd, "MISSING_IN_MIGRATED");
});

test("source broadened to any is a security regression", async () => {
  const source = await parsePanosXml(cfg(RULE_ERP));
  const migrated = await parsePanosXml(
    cfg(RULE_ERP.replace("<source><member>ERP-Servers</member></source>", "<source><member>any</member></source>"))
  );
  const result = runComparison({ source, migrated });

  const reg = result.findings.find((f) => f.category === "SECURITY_REGRESSION");
  assert.ok(reg, "broadening an allow rule must raise a security regression");
  assert.ok(reg.title.includes("broadened") || reg.description.includes("broadened"));

  const comp = result.comparisons.find((c) => c.name === "Allow-ERP-Outbound");
  assert.equal(comp?.risk, "SECURITY_WEAKENING");
});

test("removing security profiles is a security regression", async () => {
  const source = await parsePanosXml(cfg(RULE_ERP));
  const migrated = await parsePanosXml(
    cfg(RULE_ERP.replace(/<profile-setting>[\s\S]*?<\/profile-setting>/, ""))
  );
  const result = runComparison({ source, migrated });

  const comp = result.comparisons.find((c) => c.name === "Allow-ERP-Outbound");
  const prof = comp?.differences.find((d) => d.field === "profileSetting");
  assert.ok(prof, "profile change must be detected");
  assert.equal(prof.verdict, "lost");
  assert.equal(comp?.risk, "SECURITY_WEAKENING");
});

test("broadening a deny rule is a connectivity risk, not a security weakening", async () => {
  // Same field change as the earlier test, opposite action: the classification
  // must follow the action, not the field.
  const narrowDeny = RULE_CLEANUP.replace(
    "<source><member>any</member></source>",
    "<source><member>ERP-Servers</member></source>"
  );
  const source = await parsePanosXml(cfg(narrowDeny));
  const migrated = await parsePanosXml(cfg(RULE_CLEANUP));
  const result = runComparison({ source, migrated });

  const comp = result.comparisons.find((c) => c.name === "Cleanup-Deny");
  assert.equal(comp?.risk, "CONNECTIVITY_RISK");
});

test("rule reordering across a conflicting action is critical", async () => {
  const source = await parsePanosXml(cfg(RULE_CLEANUP + RULE_ERP));
  const migrated = await parsePanosXml(cfg(RULE_ERP + RULE_CLEANUP));
  const result = runComparison({ source, migrated });

  const order = result.findings.find((f) => f.findingType === "order.critical-reorder");
  assert.ok(order, "reordering past a conflicting action must be critical");
  assert.equal(order.severity, "CRITICAL");
});

test("generated rule absent from the deployed target is a deployment failure", async () => {
  const source = await parsePanosXml(cfg(RULE_ERP + RULE_CLEANUP));
  const migrated = await parsePanosXml(cfg(RULE_ERP + RULE_CLEANUP));
  const target = await parsePanosXml(cfg(RULE_ERP)); // never landed on the device
  const result = runComparison({ source, migrated, target });

  const dep = result.findings.find(
    (f) => f.findingType === "deployment.missing-on-target" && f.entityName === "Cleanup-Deny"
  );
  assert.ok(dep, "rule missing on target must be reported");
  assert.equal(dep.category, "DEPLOYMENT_FAILURE");

  const comp = result.comparisons.find((c) => c.name === "Cleanup-Deny");
  assert.equal(comp?.sourceToMigrated, "EXACT_MATCH");
  assert.equal(comp?.migratedToDeployed, "MISSING_IN_TARGET");
});

test("rule added on the target after migration is flagged", async () => {
  const source = await parsePanosXml(cfg(RULE_ERP));
  const migrated = await parsePanosXml(cfg(RULE_ERP));
  const target = await parsePanosXml(cfg(RULE_ERP + RULE_CLEANUP)); // admin added it
  const result = runComparison({ source, migrated, target });

  const extra = result.findings.find(
    (f) => f.findingType === "deployment.extra-on-target" && f.entityName === "Cleanup-Deny"
  );
  assert.ok(extra, "unexpected target rule must be reported");
});

test("unresolved object reference is a dependency failure", async () => {
  const rule = RULE_ERP.replace(
    "<source><member>ERP-Servers</member></source>",
    "<source><member>Does-Not-Exist</member></source>"
  );
  const migrated = await parsePanosXml(cfg(rule));
  const result = runComparison({ migrated });

  const dep = result.findings.find((f) => f.findingType === "dependency.unresolved-address");
  assert.ok(dep, "unresolved reference must be reported");
  assert.equal(dep.severity, "HIGH");
});

test("matching rule counts alone cannot produce a passing score", async () => {
  // Same number of rules, but both are materially degraded.
  const source = await parsePanosXml(cfg(RULE_ERP + RULE_CLEANUP));
  const degraded =
    RULE_ERP.replace(
      "<source><member>ERP-Servers</member></source>",
      "<source><member>any</member></source>"
    ).replace(/<profile-setting>[\s\S]*?<\/profile-setting>/, "") +
    RULE_CLEANUP.replace("<action>deny</action>", "<action>allow</action>");
  const migrated = await parsePanosXml(cfg(degraded));
  const result = runComparison({ source, migrated });

  const scores = computeScores(result, ALL_COMPLETENESS);
  assert.ok(
    scores.securityPolicyParity !== null && scores.securityPolicyParity < 85,
    `equal rule counts must not score well; got ${scores.securityPolicyParity}`
  );
  assert.ok(scores.overall < 85, `overall should reflect regressions; got ${scores.overall}`);
});
