import { prisma } from "@/lib/prisma";
import { apiError, json, requireUser } from "@/lib/api";
import { requireProjectAccess } from "@/lib/migration/service";

export const runtime = "nodejs";

/**
 * GET /api/migrations/{id}/findings
 * Optional filters: ?category=SECURITY_REGRESSION&severity=CRITICAL
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const project = await requireProjectAccess(id, auth.user);
  if (!project) return apiError("Migration project not found", 404);

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const severity = url.searchParams.get("severity");

  const findings = await prisma.validationFinding.findMany({
    where: {
      migrationProjectId: id,
      ...(category ? { category: category as never } : {}),
      ...(severity ? { severity: severity as never } : {}),
    },
    orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
    take: 1000,
  });

  return json({ findings });
}
