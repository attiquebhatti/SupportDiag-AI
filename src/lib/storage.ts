import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

// ---------------------------------------------------------------------------
// Storage abstraction (Hostinger-first).
//
// Drivers (STORAGE_DRIVER): local (default, Hostinger MVP) | supabase | s3.
// Uploaded support files are sensitive: they are stored under UPLOAD_DIR
// (outside the public web root — never inside /public) and are only ever
// served through authenticated API endpoints, never via direct URLs.
// ---------------------------------------------------------------------------

export interface StorageProvider {
  /** Persist a file buffer under the given key; returns the storage path/key. */
  saveFile(key: string, data: Buffer, contentType?: string): Promise<string>;
  /** Read a stored file back into memory. */
  getFile(key: string): Promise<Buffer>;
  /** Remove a stored file (best effort). */
  deleteFile(key: string): Promise<void>;
  /** Signed URL for direct download, or null if the driver serves via API only. */
  getSignedUrl(key: string): Promise<string | null>;

  // Backward-compatible aliases used by existing pipeline code.
  upload(key: string, data: Buffer, contentType?: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

function withAliases(
  core: Pick<StorageProvider, "saveFile" | "getFile" | "deleteFile" | "getSignedUrl">
): StorageProvider {
  return {
    ...core,
    upload: core.saveFile,
    download: core.getFile,
    remove: core.deleteFile,
  };
}

// ---------------- Local driver (Hostinger MVP) ----------------
const localProvider = withAliases({
  async saveFile(key, data) {
    const full = path.join(config.storage.uploadDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  },
  async getFile(key) {
    return fs.readFile(path.join(config.storage.uploadDir, key));
  },
  async deleteFile(key) {
    await fs.rm(path.join(config.storage.uploadDir, key), { force: true });
  },
  async getSignedUrl() {
    return null; // local files are served through authenticated API routes only
  },
});

// ---------------- Supabase driver (optional) ----------------
let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!config.storage.supabaseUrl || !config.storage.supabaseServiceRoleKey) {
      throw new Error("Supabase storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    }
    supabase = createClient(config.storage.supabaseUrl, config.storage.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

const supabaseProvider = withAliases({
  async saveFile(key, data, contentType = "application/octet-stream") {
    const { error } = await getSupabase()
      .storage.from(config.storage.supabaseBucket)
      .upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return key;
  },
  async getFile(key) {
    const { data, error } = await getSupabase().storage.from(config.storage.supabaseBucket).download(key);
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  },
  async deleteFile(key) {
    await getSupabase().storage.from(config.storage.supabaseBucket).remove([key]);
  },
  async getSignedUrl(key) {
    const { data } = await getSupabase()
      .storage.from(config.storage.supabaseBucket)
      .createSignedUrl(key, 300);
    return data?.signedUrl ?? null;
  },
});

// ---------------- S3 / R2 driver (future) ----------------
// Placeholder: wire up @aws-sdk/client-s3 (works for AWS S3 and Cloudflare R2)
// when object storage is adopted. Kept explicit so STORAGE_DRIVER=s3 fails
// loudly rather than silently writing to disk.
const s3Provider = withAliases({
  async saveFile(): Promise<string> {
    throw new Error("S3StorageProvider is not implemented yet. Use STORAGE_DRIVER=local (Hostinger) or supabase.");
  },
  async getFile(): Promise<Buffer> {
    throw new Error("S3StorageProvider is not implemented yet.");
  },
  async deleteFile() {
    throw new Error("S3StorageProvider is not implemented yet.");
  },
  async getSignedUrl() {
    return null;
  },
});

export function getStorage(): StorageProvider {
  switch (config.storage.driver) {
    case "supabase":
      return supabaseProvider;
    case "s3":
    case "r2":
      return s3Provider;
    case "local":
    default:
      return localProvider;
  }
}

export function buildArchiveKey(uploadId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return `uploads/${uploadId}/${safe}`;
}

/** Ensure the local storage directories exist (used at boot / health check). */
export async function ensureStorageDirs(): Promise<{ dir: string; writable: boolean }[]> {
  const dirs = [config.storage.uploadDir, config.storage.extractedDir, config.storage.reportDir];
  const results: { dir: string; writable: boolean }[] = [];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      const probe = path.join(dir, ".write-test");
      await fs.writeFile(probe, "ok");
      await fs.rm(probe, { force: true });
      results.push({ dir, writable: true });
    } catch {
      results.push({ dir, writable: false });
    }
  }
  return results;
}
