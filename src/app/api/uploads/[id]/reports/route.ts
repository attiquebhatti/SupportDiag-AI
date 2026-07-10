import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUploadAccess, apiError, json } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { buildHtmlReport, buildMarkdownReport, type ReportInput } from "@/lib/report";
import { computeHealthScore } from "@/lib/health";

export const runtime = "nodejs";

const schema = z.object({
  // Template ("reportType" keeps backward compat: html/markdown map to technical)
  reportType: z.enum(["executive", "technical", "customer", "internal", "html", "markdown"]).default("technical"),
  format: z.enum(["html", "markdown"]).default("html"),
  redactSerials: z.boolean().default(true),
  redactPrivateIps: z.boolean().default(false),
  redactInternalFqdns: z.boolean().default(false),
  includeAiSummary: z.boolean().default(true),
  includeEvidence: z.boolean().default(true),
});

// GET /api/uploads/[id]/reports — list generated reports
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;
  const reports = await prisma.report.findMany({
    where: { uploadId: id },
    select: { id: true, reportType: true, format: true, redacted: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return json({ reports });
}

// POST /api/uploads/[id]/reports — generate a new report
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;
  if (!canWrite(access.user.role)) {
    return apiError("Viewers have read-only access and cannot generate reports.", 403);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return apiError("Invalid report options", 422);
  const opts = parsed.data;

  // Back-compat: old clients sent reportType html|markdown (meaning format).
  const legacyFormat = opts.reportType === "html" || opts.reportType === "markdown";
  const template = (legacyFormat ? "technical" : opts.reportType) as NonNullable<ReportInput["template"]>;
  const format = legacyFormat ? (opts.reportType as "html" | "markdown") : opts.format;

  const [device, findings, aiArtifact] = await Promise.all([
    prisma.device.findUnique({ where: { uploadId: id } }),
    prisma.finding.findMany({ where: { uploadId: id }, orderBy: { severity: "asc" } }),
    prisma.parsedArtifact.findFirst({ where: { uploadId: id, artifactType: "ai-summary" } }),
  ]);

  const score =
    access.upload.healthScore ??
    computeHealthScore(findings.map((f) => ({ severity: (f.severity.charAt(0) + f.severity.slice(1).toLowerCase()) as never })));

  const analystNotes = findings
    .filter((f) => f.analystNote)
    .map((f) => ({ finding: f.title, note: f.analystNote as string }));

  const input: ReportInput = {
    device,
    findings,
    healthScore: score,
    summary: (aiArtifact?.dataJson as { summary?: string } | null)?.summary ?? "No AI summary was generated.",
    generatedAt: new Date(),
    redaction: {
      redactPrivateIps: opts.redactPrivateIps,
      redactInternalFqdns: opts.redactInternalFqdns,
    },
    redactSerials: opts.redactSerials,
    template,
    includeAiSummary: opts.includeAiSummary,
    includeEvidence: opts.includeEvidence,
    caseMeta: {
      filename: access.upload.originalFilename,
      vendor: access.upload.detectedVendor ?? access.upload.selectedVendor,
      product: access.upload.detectedProduct ?? access.upload.selectedProduct,
    },
    analystNotes,
  };

  const content = format === "markdown" ? buildMarkdownReport(input) : buildHtmlReport(input);

  const report = await prisma.report.create({
    data: {
      uploadId: id,
      reportType: template,
      format,
      content,
      redacted: opts.redactSerials || opts.redactPrivateIps || opts.redactInternalFqdns,
    },
  });

  return json({ report: { id: report.id, reportType: template, format } , content }, 201);
}
