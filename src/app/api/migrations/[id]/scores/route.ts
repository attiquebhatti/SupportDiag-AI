import { prisma } from "@/lib/prisma";
import { apiError, json, requireUser } from "@/lib/api";
import { requireProjectAccess } from "@/lib/migration/service";

export const runtime = "nodejs";

/** GET /api/migrations/{id}/scores — cached assurance scores and completeness. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const project = await requireProjectAccess(id, auth.user);
  if (!project) return apiError("Migration project not found", 404);

  if (!project.scoresJson) {
    return json({ scores: null, completeness: null, lastValidatedAt: null });
  }

  const byRisk = await prisma.policyComparison.groupBy({
    by: ["riskClassification"],
    _count: true,
    where: { migrationProjectId: id },
  });

  return json({
    scores: project.scoresJson,
    completeness: project.completenessJson,
    lastValidatedAt: project.lastValidatedAt,
    riskBreakdown: byRisk,
  });
}
