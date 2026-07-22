import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, json, requireUser, requireWriter } from "@/lib/api";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  sourceVendor: z.string().max(60).optional(),
  sourcePlatform: z.string().max(60).optional(),
  sourceVersion: z.string().max(40).optional(),
  targetManagementType: z
    .enum(["STANDALONE_PANOS", "PANORAMA", "SCM", "PRISMA_ACCESS"])
    .default("STANDALONE_PANOS"),
  targetVersion: z.string().max(40).optional(),
  targetScope: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/migrations — the current user's migration projects.
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const projects = await prisma.migrationProject.findMany({
    where: { userId: auth.user.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      snapshots: { select: { id: true, snapshotType: true, parseStatus: true } },
      _count: { select: { findings: true, comparisons: true } },
    },
    take: 100,
  });
  return json({ projects });
}

// POST /api/migrations — create a project.
export async function POST(request: Request) {
  const auth = await requireWriter();
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be JSON", 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  }
  const d = parsed.data;

  const project = await prisma.migrationProject.create({
    data: {
      userId: auth.user.id,
      organizationId: auth.user.organizationId,
      name: d.name,
      description: d.description,
      sourceVendor: d.sourceVendor,
      sourcePlatform: d.sourcePlatform,
      sourceVersion: d.sourceVersion,
      targetManagementType: d.targetManagementType,
      targetVersion: d.targetVersion,
      targetScopeJson: (d.targetScope ?? undefined) as Prisma.InputJsonValue | undefined,
      status: "DRAFT",
    },
  });
  return json({ project }, 201);
}
