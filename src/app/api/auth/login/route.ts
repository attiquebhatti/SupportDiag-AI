import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("Invalid input", 422);

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-ish response to avoid user enumeration. OAuth-only accounts
  // (passwordHash null) can never authenticate with a password.
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return apiError("Invalid email or password", 401);
  }

  const token = await createSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
  });
  await setSessionCookie(token);
  return json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
