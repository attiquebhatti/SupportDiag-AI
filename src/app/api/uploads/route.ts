import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, requireWriter, apiError, json } from "@/lib/api";
import { config } from "@/lib/config";
import { getStorage, buildArchiveKey } from "@/lib/storage";
import { detectArchiveType, isSingleDiagnosticFile } from "@/lib/extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/uploads — list current user's (org) uploads
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const uploads = await prisma.upload.findMany({
    where: {
      deletedAt: null,
      OR: [
        { userId: user.id },
        user.organizationId ? { organizationId: user.organizationId } : { id: "__none__" },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { job: true, device: true, _count: { select: { findings: true } } },
    take: 100,
  });
  return json({ uploads });
}

// POST /api/uploads — upload a support file (multipart/form-data, field "file")
export async function POST(request: Request) {
  const auth = await requireWriter();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // Fast pre-check: reject oversized bodies before buffering the multipart data.
  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > config.limits.maxUploadBytes + 1024 * 1024) {
    return apiError(
      `File exceeds the maximum upload size of ${config.limits.maxUploadMb} MB.`,
      413
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    return apiError(
      `Could not read the uploaded file (${err instanceof Error ? err.message : "malformed request body"}). ` +
        `If the file is larger than ${config.limits.maxUploadMb} MB, reduce it or raise MAX_UPLOAD_SIZE_MB.`,
      400
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) return apiError("No file provided (field 'file')", 400);

  // Optional vendor/product hints from the upload wizard.
  const selectedVendor = (form?.get("selectedVendor") as string) || null;
  const selectedProduct = (form?.get("selectedProduct") as string) || null;
  const redactByDefault = (form?.get("redact") as string) !== "false";

  // Validate extension (archive or single diagnostic file)
  const archiveType = detectArchiveType(file.name);
  const single = !archiveType && isSingleDiagnosticFile(file.name);
  if (!archiveType && !single) {
    return apiError(
      `Unsupported file type. Allowed: ${[...config.supportedExtensions, ...config.supportedSingleFileExtensions].join(", ")}`,
      415
    );
  }
  const type = archiveType ?? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();

  // Validate size (pre-read guard using File.size)
  if (file.size > config.limits.maxUploadBytes) {
    return apiError(`File exceeds max upload size of ${config.limits.maxUploadMb} MB`, 413);
  }
  if (file.size === 0) return apiError("File is empty", 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  // Create the upload row first to obtain an id for the storage key.
  const upload = await prisma.upload.create({
    data: {
      userId: user.id,
      organizationId: user.organizationId,
      originalFilename: file.name,
      fileHash,
      fileSize: buffer.length,
      archiveStoragePath: "", // set after storage upload
      status: "UPLOADED",
      supportFileType: type,
      selectedVendor: selectedVendor && selectedVendor !== "auto" ? selectedVendor : null,
      selectedProduct: selectedProduct && selectedProduct !== "auto" ? selectedProduct : null,
      redactByDefault,
    },
  });

  try {
    const key = buildArchiveKey(upload.id, file.name);
    await getStorage().upload(key, buffer, "application/octet-stream");
    await prisma.upload.update({
      where: { id: upload.id },
      data: { archiveStoragePath: key, status: "QUEUED" },
    });
    await prisma.analysisJob.create({
      data: { uploadId: upload.id, status: "PENDING", currentStep: "queued", progress: 0 },
    });
  } catch (err) {
    // Roll back the upload row if storage failed.
    await prisma.upload.delete({ where: { id: upload.id } }).catch(() => {});
    return apiError(
      `Storage upload failed: ${err instanceof Error ? err.message : "unknown"}`,
      502
    );
  }

  return json({ upload: { id: upload.id, status: "QUEUED" } }, 201);
}
