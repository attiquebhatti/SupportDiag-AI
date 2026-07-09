import { prisma } from "@/lib/prisma";
import { requireUploadAccess, apiError } from "@/lib/api";

export const runtime = "nodejs";

// GET /api/reports/[reportId]?download=1 — fetch report content
export async function GET(req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return apiError("Report not found", 404);

  // Enforce access via the parent upload.
  const access = await requireUploadAccess(report.uploadId);
  if ("response" in access) return access.response;

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  // `format` is authoritative; legacy rows stored the format in reportType.
  const isHtml = report.format ? report.format === "html" : report.reportType !== "markdown";
  const ext = isHtml ? "html" : "md";
  const contentType = isHtml ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8";

  return new Response(report.content, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      ...(download
        ? { "Content-Disposition": `attachment; filename="firewalllens-report-${reportId}.${ext}"` }
        : {}),
    },
  });
}
