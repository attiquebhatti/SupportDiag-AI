import { prisma } from "@/lib/prisma";
import { apiError, json, requireUser, requireWriter } from "@/lib/api";
import { config } from "@/lib/config";
import { getStorage } from "@/lib/storage";
import { buildSnapshotKey, hashBuffer, parseSnapshot, requireProjectAccess } from "@/lib/migration/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const SNAPSHOT_TYPES = [
  "SOURCE",
  "MIGRATED",
  "TARGET_CANDIDATE",
  "TARGET_RUNNING",
  "TARGET_EFFECTIVE",
] as const;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const project = await requireProjectAccess(id, auth.user);
  if (!project) return apiError("Migration project not found", 404);

  const snapshots = await prisma.configurationSnapshot.findMany({
    where: { migrationProjectId: id },
    orderBy: { collectedAt: "desc" },
  });
  return json({ snapshots });
}

/**
 * POST /api/migrations/{id}/snapshots — upload a configuration (multipart).
 *
 * Fields: file, snapshotType, format (optional). Parsing runs inline so the
 * caller learns immediately whether the configuration is readable; large files
 * are streamed through the SAX parser rather than held as one string.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireWriter();
  if ("response" in auth) return auth.response;

  const project = await requireProjectAccess(id, auth.user);
  if (!project) return apiError("Migration project not found", 404);

  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > config.limits.maxUploadBytes + 1024 * 1024) {
    return apiError(
      `This configuration is larger than the current hosting limit (${config.limits.maxUploadMb} MB).`,
      413
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Expected multipart/form-data with a 'file' field", 400);
  }

  const file = form.get("file");
  const snapshotType = String(form.get("snapshotType") ?? "");
  if (!(file instanceof File)) return apiError("Missing 'file'", 400);
  if (!SNAPSHOT_TYPES.includes(snapshotType as (typeof SNAPSHOT_TYPES)[number])) {
    return apiError(`snapshotType must be one of: ${SNAPSHOT_TYPES.join(", ")}`, 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return apiError("Uploaded file is empty", 400);

  const looksXml = buf.subarray(0, 4096).toString("utf8").includes("<config");
  if (!looksXml) {
    return apiError(
      "Only PAN-OS/Panorama XML configurations are supported in this release. Export the running configuration as XML and try again.",
      415
    );
  }

  // Replace any previous snapshot of the same type; a project holds one of each.
  const existing = await prisma.configurationSnapshot.findFirst({
    where: { migrationProjectId: id, snapshotType: snapshotType as never },
  });
  if (existing) {
    await prisma.configurationSnapshot.delete({ where: { id: existing.id } });
  }

  const snapshot = await prisma.configurationSnapshot.create({
    data: {
      migrationProjectId: id,
      snapshotType: snapshotType as never,
      origin: "UPLOAD",
      format: "panos-xml",
      originalFilename: file.name,
      fileHash: hashBuffer(buf),
      fileSize: buf.length,
    },
  });

  const key = buildSnapshotKey(id, snapshot.id, file.name);
  await getStorage().saveFile(key, buf, "application/xml");
  await prisma.configurationSnapshot.update({
    where: { id: snapshot.id },
    data: { storagePath: key },
  });

  const parsed = await parseSnapshot(snapshot.id);
  if (!parsed.ok) {
    return json({ snapshot, parsed: false, error: parsed.error }, 200);
  }

  await prisma.migrationProject.update({
    where: { id },
    data: { status: "COLLECTING" },
  });

  const updated = await prisma.configurationSnapshot.findUnique({ where: { id: snapshot.id } });
  return json({ snapshot: updated, parsed: true, stats: parsed.stats }, 201);
}
