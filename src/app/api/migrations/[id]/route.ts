import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, json, requireUser, requireWriter } from "@/lib/api";
import { requireProjectAccess } from "@/lib/migration/service";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  sourceVendor: z.string().max(60).optional(),
  sourcePlatform: z.string().max(60).optional(),
  targetManagementType: z
    .enum(["STANDALONE_PANOS", "PANORAMA", "SCM", "PRISMA_ACCESS"])
    .optional(),
  targetVersion: z.string().max(40).optional(),
  targetScope: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const project = await requireProjectAccess(id, auth.user);
  if (!project) return apiError("Migration project not found", 404);

  const [snapshots, counts] = await Promise.all([
    prisma.configurationSnapshot.findMany({
      where: { migrationProjectId: id },
      orderBy: { collectedAt: "desc" },
    }),
    prisma.validationFinding.groupBy({
      by: ["severity"],
      _count: true,
      where: { migrationProjectId: id },
    }),
  ]);

  return json({ project, snapshots, findingCounts: counts });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireWriter();
  if ("response" in auth) return auth.response;

  const project = await requireProjectAccess(id, auth.user);
  if (!project) return apiError("Migration project not found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  }
  const { targetScope, ...rest } = parsed.data;

  const updated = await prisma.migrationProject.update({
    where: { id },
    data: {
      ...rest,
      ...(targetScope ? { targetScopeJson: targetScope as Prisma.InputJsonValue } : {}),
    },
  });
  return json({ project: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireWriter();
  if ("response" in auth) return auth.response;

  const project = await requireProjectAccess(id, auth.user);
  if (!project) return apiError("Migration project not found", 404);

  await prisma.migrationProject.update({ where: { id }, data: { deletedAt: new Date() } });
  return json({ ok: true });
}
