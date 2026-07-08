import { prisma } from "@/lib/prisma";
import { requireUploadAccess, apiError, json } from "@/lib/api";
import { redactText } from "@/lib/redaction";

export const runtime = "nodejs";

// GET /api/uploads/[id]/files/[fileId]?redact=1&privateIps=0&fqdns=0
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const file = await prisma.extractedFile.findFirst({ where: { id: fileId, uploadId: id } });
  if (!file) return apiError("File not found", 404);

  const url = new URL(req.url);
  // Redaction defaults to the upload's redactByDefault setting.
  const redact = url.searchParams.get("redact");
  const shouldRedact = redact == null ? access.upload.redactByDefault : redact === "1" || redact === "true";
  const privateIps = url.searchParams.get("privateIps") === "1";
  const fqdns = url.searchParams.get("fqdns") === "1";

  let content = file.content;
  if (content && shouldRedact) {
    content = redactText(content, { redactPrivateIps: privateIps, redactInternalFqdns: fqdns });
  }

  return json({
    file: {
      id: file.id,
      path: file.path,
      fileType: file.fileType,
      size: file.size,
      indexed: file.indexed,
      redacted: shouldRedact,
      content: file.indexed ? content : null,
      binaryNote: file.indexed ? null : "This file was not indexed (binary or too large).",
    },
  });
}
