import "server-only";
import { prisma } from "./prisma";
import { getStorage } from "./storage";
import { extractArchive, detectArchiveType, type ArchiveType } from "./extraction";
import { runParsers, deriveDevice } from "./parsers";
import { runRules } from "./rules/engine";
import { computeHealthScore } from "./health";
import { generateSummary } from "./ai";
import type { Severity as PrismaSeverity } from "@prisma/client";
import type { Severity } from "./rules/types";

const SEVERITY_MAP: Record<Severity, PrismaSeverity> = {
  Critical: "CRITICAL",
  High: "HIGH",
  Medium: "MEDIUM",
  Low: "LOW",
  Informational: "INFORMATIONAL",
};

async function setStep(uploadId: string, step: string, progress: number) {
  await prisma.analysisJob.update({
    where: { uploadId },
    data: { currentStep: step, progress },
  });
}

/**
 * Run the full analysis pipeline for a single upload. Designed to complete
 * within a single serverless request (no long-running daemon). Idempotent:
 * clears prior derived data before regenerating.
 */
export async function processUpload(uploadId: string): Promise<void> {
  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.deletedAt) throw new Error("Upload not found");

  const job =
    (await prisma.analysisJob.findUnique({ where: { uploadId } })) ??
    (await prisma.analysisJob.create({ data: { uploadId } }));

  await prisma.analysisJob.update({
    where: { uploadId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      errorMessage: null,
      attempts: { increment: 1 },
      progress: 5,
      currentStep: "downloading",
    },
  });
  await prisma.upload.update({ where: { id: uploadId }, data: { status: "PROCESSING" } });

  try {
    // 1. Download archive from storage
    const buffer = await getStorage().download(upload.archiveStoragePath);

    // 2. Extract safely
    await setStep(uploadId, "extracting", 20);
    const type = (upload.supportFileType as ArchiveType) ?? detectArchiveType(upload.originalFilename);
    if (!type) throw new Error("Unsupported or undetectable archive type");
    const extraction = await extractArchive(buffer, type);

    // 3. Persist extracted file metadata + indexed text (idempotent reset first)
    await setStep(uploadId, "indexing", 40);
    await prisma.$transaction([
      prisma.extractedFile.deleteMany({ where: { uploadId } }),
      prisma.parsedArtifact.deleteMany({ where: { uploadId } }),
      prisma.finding.deleteMany({ where: { uploadId } }),
    ]);

    // Insert in batches to stay within statement limits.
    const fileRows = extraction.entries.map((e) => ({
      uploadId,
      path: e.path,
      fileType: e.path.includes(".") ? e.path.slice(e.path.lastIndexOf(".") + 1) : null,
      size: e.size,
      hash: e.hash,
      content: e.content,
      indexed: e.content != null,
    }));
    for (let i = 0; i < fileRows.length; i += 500) {
      await prisma.extractedFile.createMany({ data: fileRows.slice(i, i + 500) });
    }

    // 4. Run parsers over indexed text files
    await setStep(uploadId, "parsing", 60);
    const indexed = extraction.entries
      .filter((e) => e.content != null)
      .map((e) => ({ path: e.path, content: e.content as string }));
    const artifacts = runParsers(indexed);
    if (artifacts.length > 0) {
      await prisma.parsedArtifact.createMany({
        data: artifacts.map((a) => ({
          uploadId,
          parserName: a.parserName,
          artifactType: a.artifactType,
          dataJson: a.dataJson as object,
          sourceFilePath: a.sourceFilePath,
        })),
      });
    }

    // 5. Derive device
    await setStep(uploadId, "device-detection", 70);
    const device = deriveDevice(artifacts);
    await prisma.device.deleteMany({ where: { uploadId } });
    await prisma.device.create({ data: { uploadId, ...device } });

    // 6. Run rule engine
    await setStep(uploadId, "analyzing", 82);
    const findings = runRules(artifacts);
    if (findings.length > 0) {
      await prisma.finding.createMany({
        data: findings.map((f) => ({
          uploadId,
          ruleId: f.ruleId,
          severity: SEVERITY_MAP[f.severity],
          category: f.category,
          title: f.title,
          description: f.description,
          impact: f.impact,
          recommendation: f.recommendation,
          confidence: f.confidence,
          evidenceJson: f.evidence as object,
        })),
      });
    }

    // 7. Health score
    const healthScore = computeHealthScore(findings);

    // 8. AI executive summary (optional; degrades gracefully if disabled)
    await setStep(uploadId, "summarizing", 92);
    const deviceLine = `${device.hostname ?? "unknown host"} (${device.model ?? "model?"}, PAN-OS ${device.panosVersion ?? "?"})`;
    const findingLines = findings.slice(0, 15).map((f) => `- [${f.severity}] ${f.title}`);
    const summary = await generateSummary(deviceLine, findingLines, {
      redactPrivateIps: false,
      redactInternalFqdns: false,
    });

    // Store the summary as a lightweight artifact for the overview page.
    await prisma.parsedArtifact.create({
      data: {
        uploadId,
        parserName: "ai-summary",
        artifactType: "ai-summary",
        dataJson: { summary, healthScore },
        sourceFilePath: null,
      },
    });

    // 9. Complete
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "COMPLETED", healthScore },
    });
    await prisma.analysisJob.update({
      where: { uploadId },
      data: {
        status: "COMPLETED",
        currentStep: "completed",
        progress: 100,
        completedAt: new Date(),
        errorMessage: extraction.warnings.length
          ? extraction.warnings.join("; ").slice(0, 500)
          : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error";
    await prisma.analysisJob.update({
      where: { uploadId },
      data: { status: "FAILED", currentStep: "failed", errorMessage: message.slice(0, 500) },
    });
    await prisma.upload.update({ where: { id: uploadId }, data: { status: "FAILED" } });
    throw err;
  }
}
