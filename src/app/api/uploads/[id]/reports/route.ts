import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUploadAccess, apiError, json } from "@/lib/api";
import { buildHtmlReport, buildMarkdownReport, type ReportInput } from "@/lib/report";
import { computeHealthScore } from "@/lib/health";

export const runtime = "nodejs";

const schema = z.object({
  reportType: z.enum(["html", "markdown"]).default("html"),
  redactSerials: z.boolean().default(true),
  redactPrivateIps: z.boolean().default(false),
  redactInternalFqdns: z.boolean().default(false),
});

// GET /api/uploads/[id]/reports — list generated reports
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;
  const reports = await prisma.report.findMany({
    where: { uploadId: id },
    select: { id: true, reportType: true, redacted: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return json({ reports });
}

// POST /api/uploads/[id]/reports — generate a new report
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return apiError("Invalid report options", 422);
  const opts = parsed.data;

  const [device, findings, aiArtifact] = await Promise.all([
    prisma.device.findUnique({ where: { uploadId: id } }),
    prisma.finding.findMany({ where: { uploadId: id }, orderBy: { severity: "asc" } }),
    prisma.parsedArtifact.findFirst({ where: { uploadId: id, artifactType: "ai-summary" } }),
  ]);

  const score =
    access.upload.healthScore ??
    computeHealthScore(findings.map((f) => ({ severity: (f.severity.charAt(0) + f.severity.slice(1).toLowerCase()) as never })));

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
  };

  const content = opts.reportType === "markdown" ? buildMarkdownReport(input) : buildHtmlReport(input);

  const report = await prisma.report.create({
    data: {
      uploadId: id,
      reportType: opts.reportType,
      content,
      redacted: opts.redactSerials || opts.redactPrivateIps || opts.redactInternalFqdns,
    },
  });

  return json({ report: { id: report.id, reportType: report.reportType }, content }, 201);
}
