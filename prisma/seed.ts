import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

  console.log("Seed complete. Default password for all seed users: ChangeMe123!");
  console.log("Users:", users.map((u) => u.email).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
