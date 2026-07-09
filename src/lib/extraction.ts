import "server-only";
import zlib from "zlib";
import { promisify } from "util";
import { createHash } from "crypto";
import { extract as tarExtract } from "tar-stream";
import { Readable } from "stream";
import AdmZip from "adm-zip";
import { config } from "./config";

const gunzip = promisify(zlib.gunzip);

export interface ExtractedEntry {
  path: string; // normalised, safe relative path
  size: number;
  hash: string;
  isText: boolean;
  content: string | null; // populated only for indexed text files
}

export interface ExtractionResult {
  entries: ExtractedEntry[];
  totalBytes: number;
  fileCount: number;
  truncated: boolean; // true if limits stopped extraction early
  warnings: string[];
}

export type ArchiveType = "tgz" | "tar.gz" | "tar" | "zip";

const TEXT_EXTENSIONS = new Set([
  ".txt", ".log", ".xml", ".json", ".conf", ".cfg", ".cnf", ".yaml", ".yml",
  ".csv", ".tsv", ".ini", ".md", ".sh", ".html", ".htm", ".properties",
  ".list", ".status", ".info", ".dat", ".out", ".dump", ".stats", ".report",
]);

export function detectArchiveType(filename: string): ArchiveType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".tar.gz")) return "tar.gz";
  if (lower.endsWith(".tgz")) return "tgz";
  if (lower.endsWith(".tar")) return "tar";
  if (lower.endsWith(".zip")) return "zip";
  return null;
}

const SINGLE_FILE_EXT = [".log", ".txt", ".json", ".xml"];

export function isSingleDiagnosticFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SINGLE_FILE_EXT.some((e) => lower.endsWith(e));
}

/** Wrap a single (non-archive) diagnostic file as a one-entry extraction result. */
export function singleFileResult(filename: string, buffer: Buffer): ExtractionResult {
  const safe = safeEntryPath(filename) ?? "uploaded-file";
  const isText = true;
  const indexable = buffer.length <= config.limits.maxIndexedFileBytes;
  return {
    entries: [
      {
        path: safe,
        size: buffer.length,
        hash: hashBuffer(buffer),
        isText,
        content: indexable ? buffer.toString("utf8") : null,
      },
    ],
    totalBytes: buffer.length,
    fileCount: 1,
    truncated: !indexable,
    warnings: indexable ? [] : ["File too large to index fully."],
  };
}

/**
 * Normalise an archive entry path and reject anything that attempts path
 * traversal or absolute escape. Returns null for unsafe / non-file entries.
 */
export function safeEntryPath(rawPath: string): string | null {
  if (!rawPath) return null;
  // Normalise separators and strip leading slashes / drive letters. Any UNC or
  // absolute path collapses to relative segments here; `..` is rejected below.
  const p = rawPath.replace(/\\/g, "/").replace(/^([a-zA-Z]:)?\/+/, "");
  const segments = p.split("/").filter((s) => s.length > 0);
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") return null; // traversal attempt — reject entirely
    if (seg.includes("\0")) return null;
    out.push(seg);
  }
  if (out.length === 0) return null;
  return out.join("/");
}

function looksLikeText(filename: string, buffer: Buffer): boolean {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Many PAN-OS support files have no extension; sniff for binary null bytes.
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.length === 0) return true;
  let nulls = 0;
  for (const byte of sample) if (byte === 0) nulls++;
  return nulls / sample.length < 0.01;
}

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

interface Collector {
  entries: ExtractedEntry[];
  totalBytes: number;
  fileCount: number;
  truncated: boolean;
  warnings: string[];
}

function addEntry(c: Collector, rawPath: string, buffer: Buffer): boolean {
  // returns false when a hard limit is reached and extraction should stop
  const safe = safeEntryPath(rawPath);
  if (!safe) {
    c.warnings.push(`Skipped unsafe path: ${rawPath}`);
    return true;
  }
  if (c.fileCount >= config.limits.maxExtractedFiles) {
    c.truncated = true;
    return false;
  }
  if (c.totalBytes + buffer.length > config.limits.maxExtractedBytes) {
    c.truncated = true;
    c.warnings.push("Extracted size limit reached; remaining files skipped.");
    return false;
  }

  const isText = looksLikeText(safe, buffer);
  const indexable = isText && buffer.length <= config.limits.maxIndexedFileBytes;
  c.entries.push({
    path: safe,
    size: buffer.length,
    hash: hashBuffer(buffer),
    isText,
    content: indexable ? buffer.toString("utf8") : null,
  });
  c.totalBytes += buffer.length;
  c.fileCount += 1;
  return true;
}

async function extractTarBuffer(tarBuffer: Buffer, c: Collector): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const extractor = tarExtract();
    let stopped = false;

    extractor.on("entry", (header, stream, next) => {
      if (stopped || header.type !== "file") {
        stream.resume();
        return next();
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        // Guard against a single huge file blowing memory.
        if (bytes <= config.limits.maxExtractedBytes) chunks.push(chunk);
      });
      stream.on("end", () => {
        const cont = addEntry(c, header.name, Buffer.concat(chunks));
        if (!cont) stopped = true;
        next();
      });
      stream.on("error", (err) => reject(err));
    });

    extractor.on("finish", () => resolve());
    extractor.on("error", (err) => reject(err));

    Readable.from(tarBuffer).pipe(extractor);
  });
}

/**
 * Extract an archive buffer into in-memory entries, enforcing size / count
 * limits and rejecting path-traversal entries. Never executes any content.
 */
export async function extractArchive(
  buffer: Buffer,
  type: ArchiveType
): Promise<ExtractionResult> {
  const c: Collector = {
    entries: [],
    totalBytes: 0,
    fileCount: 0,
    truncated: false,
    warnings: [],
  };

  if (type === "zip") {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    let skippedEncrypted = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      // Encrypted / password-protected entries (common in Cortex XDR bundles)
      // cannot be read without a password — skip them instead of failing the
      // whole analysis.
      let data: Buffer;
      try {
        if (entry.header.flags & 0x1) {
          skippedEncrypted++;
          continue;
        }
        data = entry.getData();
      } catch {
        skippedEncrypted++;
        continue;
      }
      if (!addEntry(c, entry.entryName, data)) break;
    }
    if (skippedEncrypted > 0) {
      c.warnings.push(
        `${skippedEncrypted} encrypted/unreadable zip entr${skippedEncrypted === 1 ? "y was" : "ies were"} skipped (password-protected content cannot be analyzed).`
      );
    }
    if (c.fileCount === 0 && skippedEncrypted > 0) {
      throw new Error(
        "This archive appears to be password-protected — none of its entries could be read. Extract it locally with the password and re-upload the contents as a plain .zip/.tgz."
      );
    }
  } else {
    let tarBuffer = buffer;
    if (type === "tgz" || type === "tar.gz") {
      tarBuffer = await gunzip(buffer);
    }
    await extractTarBuffer(tarBuffer, c);
  }

  return {
    entries: c.entries,
    totalBytes: c.totalBytes,
    fileCount: c.fileCount,
    truncated: c.truncated,
    warnings: c.warnings,
  };
}
