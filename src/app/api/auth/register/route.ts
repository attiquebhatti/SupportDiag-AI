import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("Invalid input", 422, { issues: parsed.error.flatten() });

  const { name, email, password } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return apiError("An account with this email already exists", 409);

    // First user in the system becomes ADMIN and gets a default organization.
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? "ADMIN" : "ENGINEER";

    let organizationId: string | null = null;
    if (userCount === 0) {
      const org = await prisma.organization.create({
        data: { name: "Default Organization", plan: "startup", retentionDays: 7 },
      });
      organizationId = org.id;
    } else {
      const firstOrg = await prisma.organization.findFirst();
      organizationId = firstOrg?.id ?? null;
    }

    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password), role, organizationId },
      select: { id: true, name: true, email: true, role: true, organizationId: true },
    });

    const token = await createSessionToken(user);
    await setSessionCookie(token);
    return json({ user }, 201);
  } catch (error) {
    console.error("Registration failed", error);
    return apiError(
      "Registration failed because the database is not ready. Check DATABASE_URL and run Prisma migrations.",
      503
    );
  }
}