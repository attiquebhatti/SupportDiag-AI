import { prisma } from "@/lib/prisma";
import { apiError, json, requireWriter } from "@/lib/api";
import { requireProjectAccess, runValidation } from "@/lib/migration/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/migrations/{id}/validate — run the comparison pipeline.
 *
 * Read-only with respect to the firewall: this never contacts or modifies a
 * target device, it only compares configurations already collected.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireWriter();
  if ("response" in auth) return auth.response;

  const project = await requireProjectAccess(id, auth.user);
  if (!project) return apiError("Migration project not found", 404);

  const snapshots = await prisma.configurationSnapshot.findMany({
    where: { migrationProjectId: id },
    select: { snapshotType: true, parseStatus: true },
  });

  const parsed = snapshots.filter((s) => s.parseStatus === "PARSED");
  if (parsed.length < 2) {
    return apiError(
      "At least two parsed configurations are required — typically the source and the migration output.",
      400
    );
  }
  if (!parsed.some((s) => s.snapshotType === "MIGRATED")) {
    return apiError(
      "A migrated configuration is required; it is the pivot both comparison hops run through.",
      400
    );
  }

  try {
    const outcome = await runValidation(id);
    return json(outcome);
  } catch (err) {
    await prisma.migrationProject.update({ where: { id }, data: { status: "FAILED" } });
    const message = err instanceof Error ? err.message : String(err);
    return apiError(`Validation failed: ${message}`, 500);
  }
}
