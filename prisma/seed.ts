import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PARSER_CATALOG } from "../src/lib/parsers/registry";
import { RULE_CATALOG_UNIQUE } from "../src/lib/rules/registry";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "seed-org" },
    update: {},
    create: { id: "seed-org", name: "Default Organization", plan: "startup", retentionDays: 7 },
  });

  const password = await bcrypt.hash("ChangeMe123!", 10);

  const users = [
    { email: "admin@firewalllens.local", name: "Admin User", role: "ADMIN" as const },
    { email: "engineer@firewalllens.local", name: "Engineer User", role: "ENGINEER" as const },
    { email: "viewer@firewalllens.local", name: "Viewer User", role: "VIEWER" as const },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash: password, organizationId: org.id },
    });
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

  console.log("Seed complete. Default password for all seed users: ChangeMe123!");
  console.log("Users:", users.map((u) => u.email).join(", "));
  console.log(`Parsers: ${PARSER_CATALOG.length}, Rules: ${RULE_CATALOG_UNIQUE.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
