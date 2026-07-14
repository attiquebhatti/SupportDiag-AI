import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PARSER_CATALOG } from "../src/lib/parsers/registry";
import { RULE_CATALOG_UNIQUE } from "../src/lib/rules/registry";
import { KNOWN_ISSUE_CATALOG } from "../src/lib/known-issues";

const prisma = new PrismaClient();

async function main() {
  // Demo users are for local development only. In production, run the seed
  // with default settings to register parsers/rules, and create the first
  // (admin) account through the app's register page instead.
  const seedDemoUsers =
    process.env.SEED_DEMO_USERS === "true" || process.env.NODE_ENV !== "production";

  if (seedDemoUsers) {
    const org = await prisma.organization.upsert({
      where: { id: "seed-org" },
      update: {},
      create: { id: "seed-org", name: "Default Organization", plan: "startup", retentionDays: 7 },
    });

    const password = await bcrypt.hash("ChangeMe123!", 10);

    const users = [
      { email: "admin@supportdiag.local", name: "Admin User", role: "ADMIN" as const },
      { email: "engineer@supportdiag.local", name: "Engineer User", role: "ENGINEER" as const },
      { email: "viewer@supportdiag.local", name: "Viewer User", role: "VIEWER" as const },
    ];

    for (const u of users) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, passwordHash: password, organizationId: org.id },
      });
    }
    console.log("Demo users seeded (local dev). Password: ChangeMe123!");
  } else {
    console.log("Production mode: skipping demo users (set SEED_DEMO_USERS=true to force).");
  }

  // Vendor parser registry
  for (const p of PARSER_CATALOG) {
    await prisma.vendorParser.upsert({
      where: { vendor_product_parserName: { vendor: p.vendor, product: p.product, parserName: p.parserName } },
      update: { maturity: p.maturity },
      create: { vendor: p.vendor, product: p.product, parserName: p.parserName, maturity: p.maturity, enabled: true },
    });
  }

  // Diagnostic rule registry
  for (const r of RULE_CATALOG_UNIQUE) {
    await prisma.diagnosticRule.upsert({
      where: { ruleId: r.ruleId },
      update: { category: r.category, severity: r.severity, title: r.title, maturity: r.maturity },
      create: {
        ruleId: r.ruleId,
        vendor: r.vendor,
        product: r.product,
        category: r.category,
        severity: r.severity,
        title: r.title,
        maturity: r.maturity,
        enabled: true,
      },
    });
  }

  // Known-issue signature catalog (placeholder families; see src/lib/known-issues)
  for (const ki of KNOWN_ISSUE_CATALOG) {
    await prisma.knownIssue.upsert({
      where: { issueId: ki.issueId },
      update: {
        title: ki.title,
        minAffectedVersion: ki.minAffectedVersion,
        maxAffectedVersion: ki.maxAffectedVersion,
        fixedVersion: ki.fixedVersion,
        symptomPatternsJson: ki.symptomPatterns,
        requiredEvidenceJson: ki.requiredEvidence,
        exclusionCriteriaJson: ki.exclusionPatterns,
        sourceReference: ki.sourceReference,
        remediation: ki.remediation,
      },
      create: {
        issueId: ki.issueId,
        vendor: ki.vendor,
        product: ki.product,
        title: ki.title,
        minAffectedVersion: ki.minAffectedVersion,
        maxAffectedVersion: ki.maxAffectedVersion,
        fixedVersion: ki.fixedVersion,
        symptomPatternsJson: ki.symptomPatterns,
        requiredEvidenceJson: ki.requiredEvidence,
        exclusionCriteriaJson: ki.exclusionPatterns,
        sourceReference: ki.sourceReference,
        remediation: ki.remediation,
        enabled: true,
      },
    });
  }

  console.log(
    `Seed complete. Parsers: ${PARSER_CATALOG.length}, Rules: ${RULE_CATALOG_UNIQUE.length}, Known issues: ${KNOWN_ISSUE_CATALOG.length}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
