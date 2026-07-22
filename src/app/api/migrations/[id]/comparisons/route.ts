import { prisma } from "@/lib/prisma";
import { apiError, json, requireUser } from "@/lib/api";
import { requireProjectAccess } from "@/lib/migration/service";

export const runtime = "nodejs";

/**
 * GET /api/migrations/{id}/comparisons
 * Optional filters: ?policyType=security-rule&status=MISSING_IN_MIGRATED
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const project = await requireProjectAccess(id, auth.user);
  if (!project) return apiError("Migration project not found", 404);

  const url = new URL(request.url);
  const policyType = url.searchParams.get("policyType");
  const status = url.searchParams.get("status");

  const comparisons = await prisma.policyComparison.findMany({
    where: {
      migrationProjectId: id,
      ...(policyType ? { policyType } : {}),
      ...(status ? { endToEndStatus: status as never } : {}),
    },
    orderBy: [{ policyType: "asc" }, { migratedOrder: "asc" }, { ruleName: "asc" }],
    take: 2000,
  });

  return json({ comparisons });
}
