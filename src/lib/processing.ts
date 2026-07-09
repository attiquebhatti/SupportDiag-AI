import "server-only";
import { prisma } from "./prisma";
import { getStorage } from "./storage";
import { extractArchive, detectArchiveType, isSingleDiagnosticFile, singleFileResult, type ArchiveType } from "./extraction";
import { deriveDevice } from "./parsers";
import { runParsersForProduct } from "./parsers/registry";
import { runRulesForProduct } from "./rules/registry";
import { computeHealthScore } from "./health";
import { generateSummary } from "./ai";
import { detectVendorProduct } from "./detection";
import { PRODUCT_MAP, vendorLabel, productLabel } from "./vendors";
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

    // 2. Extract safely (archive) or wrap a single diagnostic file
    await setStep(uploadId, "extracting", 20);
    const archiveType = detectArchiveType(upload.originalFilename) ??
      (["tgz", "tar.gz", "tar", "zip"].includes(upload.supportFileType ?? "")
        ? (upload.supportFileType as ArchiveType)
        : null);
    let extraction;
    if (archiveType) {
      extraction = await extractArchive(buffer, archiveType);
    } else if (isSingleDiagnosticFile(upload.originalFilename)) {
      extraction = singleFileResult(upload.originalFilename, buffer);
    } else {
      throw new Error("Unsupported or undetectable file type");
    }

    // 3. Persist extracted file metadata + indexed text (idempotent reset first)
    await setStep(uploadId, "indexing", 35);
    await prisma.$transaction([
      prisma.extractedFile.deleteMany({ where: { uploadId } }),
      prisma.parsedArtifact.deleteMany({ where: { uploadId } }),
      prisma.finding.deleteMany({ where: { uploadId } }),
      prisma.asset.deleteMany({ where: { uploadId } }),
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

    const indexed = extraction.entries
      .filter((e) => e.content != null)
      .map((e) => ({ path: e.path, content: e.content as string }));

    // 4. Detect vendor / product (honoring any user selection)
    await setStep(uploadId, "detecting", 48);
    const detection = detectVendorProduct({
      files: indexed,
      selectedVendor: upload.selectedVendor,
      selectedProduct: upload.selectedProduct,
    });
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        detectedVendor: detection.vendor,
        detectedProduct: detection.product,
        detectionConfidence: detection.confidence,
      },
    });

    // 5. Run the parser set for the detected product
    await setStep(uploadId, "parsing", 62);
    const artifacts = runParsersForProduct(detection.vendor, detection.product, indexed);
    if (artifacts.length > 0) {
      await prisma.parsedArtifact.createMany({
        data: artifacts.map((a) => ({
          uploadId,
          vendor: a.vendor ?? detection.vendor ?? undefined,
          product: a.product ?? detection.product ?? undefined,
          parserName: a.parserName,
          artifactType: a.artifactType,
          dataJson: a.dataJson as object,
          sourceFilePath: a.sourceFilePath,
        })),
      });
    }

    // 6. Derive device (PAN-OS) + normalized Asset
    await setStep(uploadId, "device-detection", 72);
    const device = deriveDevice(artifacts);
    await prisma.device.deleteMany({ where: { uploadId } });
    await prisma.device.create({ data: { uploadId, ...device } });

    const asset = await prisma.asset.create({
      data: {
        uploadId,
        vendor: detection.vendor,
        product: detection.product,
        hostname: device.hostname,
        serialNumber: device.serialNumber,
        version: device.panosVersion,
        model: device.model,
        role: detection.product ? PRODUCT_MAP[detection.product]?.shortLabel ?? null : null,
        metadataJson: { ...device, detectionSignals: detection.signals },
      },
    });

    // 7. Run the rule set for the detected product
    await setStep(uploadId, "analyzing", 84);
    const findings = runRulesForProduct(detection.product, artifacts);
    if (findings.length > 0) {
      await prisma.finding.createMany({
        data: findings.map((f) => ({
          uploadId,
          assetId: asset.id,
          vendor: detection.vendor ?? undefined,
          product: detection.product ?? undefined,
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

    // 8. Health score
    const healthScore = computeHealthScore(findings);

    // 9. AI executive summary (optional; degrades gracefully if disabled)
    await setStep(uploadId, "summarizing", 93);
    const vLabel = vendorLabel(detection.vendor);
    const pLabel = productLabel(detection.product);
    const deviceLine = `${device.hostname ?? "unknown host"} — ${vLabel} ${pLabel}${device.model ? ` (${device.model})` : ""}${device.panosVersion ? `, v${device.panosVersion}` : ""}`;
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
        dataJson: {
          summary,
          healthScore,
          detection: {
            vendor: detection.vendor,
            product: detection.product,
            confidence: detection.confidence,
            level: detection.level,
            signals: detection.signals,
          },
        },
        sourceFilePath: null,
      },
    });

    // 10. Complete
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
