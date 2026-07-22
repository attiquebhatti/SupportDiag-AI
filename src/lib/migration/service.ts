// Migration Assurance persistence and orchestration.
//
// Keeps the pure comparison engine free of database concerns: this module loads
// snapshots, drives the parser, and writes results back in batches sized for
// Hostinger's MySQL rather than in one large transaction.

import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import type { SessionUser } from "@/lib/auth";
import { runComparison } from "./compare/engine";
import type { FindingDraft } from "./compare/types";
import { parsePanosXmlStream } from "./parsers/panos-xml";
import { type Completeness, type ScoreBreakdown, computeScores } from "./scoring";
import { type NormalizedConfig, type NormalizedEntity, emptyConfig } from "./types";

/** Rows written per insert. Large configs can produce tens of thousands. */
const BATCH_SIZE = 500;
/** Bytes fed to the streaming parser at a time. */
const CHUNK_BYTES = 1024 * 1024;

export function buildSnapshotKey(projectId: string, snapshotId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return `migrations/${projectId}/${snapshotId}/${safe}`;
}

/**
 * Load a migration project the current user owns. Mirrors upload isolation:
 * a non-owner is told the project does not exist.
 */
export async function requireProjectAccess(projectId: string, user: SessionUser) {
  const project = await prisma.migrationProject.findUnique({ where: { id: projectId } });
  if (!project || project.deletedAt) return null;
  if (project.userId !== user.id) return null;
  return project;
}

/** Split a buffer so the parser never receives the whole file as one string. */
async function* bufferChunks(buf: Buffer): AsyncGenerator<string> {
  for (let i = 0; i < buf.length; i += CHUNK_BYTES) {
    yield buf.subarray(i, i + CHUNK_BYTES).toString("utf8");
  }
}

/**
 * Parse a stored snapshot into NormalizedObject rows. Existing rows for the
 * snapshot are cleared first so re-parsing is idempotent.
 */
export async function parseSnapshot(snapshotId: string): Promise<{
  ok: boolean;
  error?: string;
  stats?: Record<string, number>;
}> {
  const snapshot = await prisma.configurationSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) return { ok: false, error: "Snapshot not found" };
  if (!snapshot.storagePath) return { ok: false, error: "Snapshot has no stored file" };

  await prisma.configurationSnapshot.update({
    where: { id: snapshotId },
    data: { parseStatus: "PARSING", parseError: null },
  });

  try {
    const buf = await getStorage().getFile(snapshot.storagePath);
    const config = await parsePanosXmlStream(bufferChunks(buf), {
      sourceLabel: snapshot.originalFilename ?? snapshot.format,
    });

    await prisma.normalizedObject.deleteMany({ where: { snapshotId } });

    const rows: Prisma.NormalizedObjectCreateManyInput[] = config.entities.map((e) => ({
      snapshotId,
      objectType: e.objectType,
      originalId: e.originalId ?? null,
      name: e.name,
      normalizedName: e.normalizedName,
      vendor: e.vendor ?? null,
      scope: e.scope,
      parentScope: e.parentScope ?? null,
      ruleOrder: (e as { order?: number }).order ?? null,
      enabled: e.enabled,
      dataJson: e as unknown as Prisma.InputJsonValue,
      sourceReference: e.sourceReference ?? null,
      checksum: e.checksum,
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await prisma.normalizedObject.createMany({ data: rows.slice(i, i + BATCH_SIZE) });
    }

    const stats = { ...config.stats, scopes: config.scopes.length };
    await prisma.configurationSnapshot.update({
      where: { id: snapshotId },
      data: {
        parseStatus: "PARSED",
        parsedAt: new Date(),
        version: config.version ?? null,
        statsJson: {
          ...stats,
          managementType: config.managementType,
          warnings: config.warnings.slice(0, 50),
          scopeList: config.scopes.map((s) => s.id),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return { ok: true, stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.configurationSnapshot.update({
      where: { id: snapshotId },
      data: { parseStatus: "FAILED", parseError: message.slice(0, 1000) },
    });
    return { ok: false, error: message };
  }
}

/** Rebuild a NormalizedConfig from persisted rows. */
async function loadConfig(snapshotId: string | undefined): Promise<NormalizedConfig | undefined> {
  if (!snapshotId) return undefined;
  const snapshot = await prisma.configurationSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot || snapshot.parseStatus !== "PARSED") return undefined;

  const rows = await prisma.normalizedObject.findMany({ where: { snapshotId } });
  const cfg = emptyConfig(snapshot.format);
  cfg.version = snapshot.version ?? undefined;
  cfg.entities = rows.map((r) => r.dataJson as unknown as NormalizedEntity);
  const stats = (snapshot.statsJson ?? {}) as Record<string, unknown>;
  cfg.managementType =
    (stats.managementType as NormalizedConfig["managementType"]) ?? "unknown";
  cfg.scopes = ((stats.scopeList as string[]) ?? []).map((id) => ({
    id,
    kind: id.startsWith("dg:")
      ? "device-group"
      : id.startsWith("vsys:")
        ? "vsys"
        : id.startsWith("template:")
          ? "template"
          : "shared",
    name: id.includes(":") ? id.split(":")[1] : id,
  }));
  return cfg;
}

export interface ValidationOutcome {
  scores: ScoreBreakdown;
  completeness: Completeness;
  comparisonCount: number;
  findingCount: number;
}

/**
 * Run the full validation pipeline for a project and persist the results,
 * replacing any previous run.
 */
export async function runValidation(projectId: string): Promise<ValidationOutcome> {
  const snapshots = await prisma.configurationSnapshot.findMany({
    where: { migrationProjectId: projectId },
    orderBy: { collectedAt: "desc" },
  });

  const pick = (type: string) => snapshots.find((s) => s.snapshotType === type);
  const sourceSnap = pick("SOURCE");
  const migratedSnap = pick("MIGRATED");
  // Prefer the effective/running configuration over a candidate when both exist.
  const targetSnap = pick("TARGET_EFFECTIVE") ?? pick("TARGET_RUNNING") ?? pick("TARGET_CANDIDATE");

  await prisma.migrationProject.update({
    where: { id: projectId },
    data: { status: "VALIDATING" },
  });

  const [source, migrated, target] = await Promise.all([
    loadConfig(sourceSnap?.id),
    loadConfig(migratedSnap?.id),
    loadConfig(targetSnap?.id),
  ]);

  const result = runComparison({ source, migrated, target });

  const completeness: Completeness = {
    sourceProvided: !!source,
    migratedProvided: !!migrated,
    targetRetrieved: !!target,
    commitValidated: false,
    deploymentVerified: !!target,
    policyTestsCompleted: false,
    runtimeChecksCompleted: false,
  };
  const scores = computeScores(result, completeness);

  // Replace prior results for this project.
  await prisma.policyComparison.deleteMany({ where: { migrationProjectId: projectId } });
  await prisma.validationFinding.deleteMany({
    where: { migrationProjectId: projectId, status: "OPEN" },
  });

  const comparisonRows: Prisma.PolicyComparisonCreateManyInput[] = result.comparisons.map((c) => ({
    migrationProjectId: projectId,
    policyType: c.policyType ?? c.objectType,
    ruleName: c.name,
    sourceOrder: c.sourceOrder ?? null,
    migratedOrder: c.migratedOrder ?? null,
    targetOrder: c.targetOrder ?? null,
    sourceToMigrated: c.sourceToMigrated,
    migratedToDeployed: c.migratedToDeployed,
    endToEndStatus: c.endToEnd,
    riskClassification: c.risk,
    differencesJson: {
      differences: c.differences,
      notes: c.transformationNotes,
      mappingType: c.mappingType,
    } as unknown as Prisma.InputJsonValue,
    confidence: c.confidence,
    scope: c.scope,
  }));
  for (let i = 0; i < comparisonRows.length; i += BATCH_SIZE) {
    await prisma.policyComparison.createMany({ data: comparisonRows.slice(i, i + BATCH_SIZE) });
  }

  const findingRows: Prisma.ValidationFindingCreateManyInput[] = dedupe(result.findings).map((f) => ({
    migrationProjectId: projectId,
    category: f.category,
    severity: f.severity,
    findingType: f.findingType,
    title: f.title.slice(0, 255),
    description: f.description,
    entityType: f.entityType ?? null,
    entityName: f.entityName ?? null,
    sourceEvidenceJson: (f.sourceEvidence ?? null) as Prisma.InputJsonValue,
    migratedEvidenceJson: (f.migratedEvidence ?? null) as Prisma.InputJsonValue,
    targetEvidenceJson: (f.targetEvidence ?? null) as Prisma.InputJsonValue,
    impact: f.impact ?? null,
    recommendation: f.recommendation ?? null,
    remediationJson: (f.remediation ?? null) as unknown as Prisma.InputJsonValue,
  }));
  for (let i = 0; i < findingRows.length; i += BATCH_SIZE) {
    await prisma.validationFinding.createMany({ data: findingRows.slice(i, i + BATCH_SIZE) });
  }

  await prisma.migrationProject.update({
    where: { id: projectId },
    data: {
      status: "COMPLETED",
      lastValidatedAt: new Date(),
      scoresJson: scores as unknown as Prisma.InputJsonValue,
      completenessJson: completeness as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    scores,
    completeness,
    comparisonCount: comparisonRows.length,
    findingCount: findingRows.length,
  };
}

/** Collapse identical findings so one systemic issue is reported once. */
function dedupe(findings: FindingDraft[]): FindingDraft[] {
  const seen = new Set<string>();
  const out: FindingDraft[] = [];
  for (const f of findings) {
    const key = createHash("sha1")
      .update(`${f.findingType}|${f.entityName ?? ""}|${f.title}`)
      .digest("hex");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
