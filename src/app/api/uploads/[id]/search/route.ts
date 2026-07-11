import { prisma } from "@/lib/prisma";
import { requireUploadAccess, apiError, json } from "@/lib/api";
import { redactText } from "@/lib/redaction";

export const runtime = "nodejs";

// GET /api/uploads/[id]/search?q=&regex=1&path=&redact=1
// Keyword or regex search across indexed file content, returning matching lines.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireUploadAccess(id);
  if ("response" in access) return access.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const useRegex = url.searchParams.get("regex") === "1";
  const pathFilter = url.searchParams.get("path") || "";
  const redact = url.searchParams.get("redact");
  const shouldRedact = redact == null ? access.upload.redactByDefault : redact === "1";

  if (!q) return apiError("Missing query 'q'", 400);

  let matcher: RegExp;
  try {
    matcher = useRegex
      ? new RegExp(q, "i")
      : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  } catch {
    return apiError("Invalid regular expression", 422);
  }

  const files = await prisma.extractedFile.findMany({
    where: {
      uploadId: id,
      indexed: true,
      // MySQL's default collation is case-insensitive; `mode: "insensitive"`
      // is a Postgres-only Prisma option and must not be used here.
      ...(pathFilter ? { path: { contains: pathFilter } } : {}),
    },
    select: { id: true, path: true, content: true },
  });

  const MAX_RESULTS = 300;
  const results: Array<{
    fileId: string;
    path: string;
    line: number;
    text: string;
  }> = [];

  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (matcher.test(lines[i])) {
        let text = lines[i].slice(0, 400);
        if (shouldRedact) text = redactText(text);
        results.push({ fileId: file.id, path: file.path, line: i + 1, text });
        if (results.length >= MAX_RESULTS) break;
      }
    }
    if (results.length >= MAX_RESULTS) break;
  }

  return json({ query: q, regex: useRegex, count: results.length, truncated: results.length >= MAX_RESULTS, results });
}
