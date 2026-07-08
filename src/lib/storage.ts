import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

// Storage abstraction for the original uploaded archive. The provider is
// selected via STORAGE_PROVIDER. Supabase Storage is the production default;
// `local` is provided for early MVP testing on a single Hostinger node.

export interface StorageProvider {
  upload(key: string, data: Buffer, contentType?: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

// ---------------- Supabase provider ----------------
let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!config.storage.supabaseUrl || !config.storage.supabaseServiceRoleKey) {
      throw new Error("Supabase storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    }
    supabase = createClient(
      config.storage.supabaseUrl,
      config.storage.supabaseServiceRoleKey,
      { auth: { persistSession: false } }
    );
  }
  return supabase;
}

const supabaseProvider: StorageProvider = {
  async upload(key, data, contentType = "application/octet-stream") {
    const client = getSupabase();
    const { error } = await client.storage
      .from(config.storage.supabaseBucket)
      .upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return key;
  },
  async download(key) {
    const client = getSupabase();
    const { data, error } = await client.storage
      .from(config.storage.supabaseBucket)
      .download(key);
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  },
  async remove(key) {
    const client = getSupabase();
    await client.storage.from(config.storage.supabaseBucket).remove([key]);
  },
};

// ---------------- Local provider (MVP testing) ----------------
const LOCAL_ROOT = path.join(process.cwd(), "storage", "archives");

const localProvider: StorageProvider = {
  async upload(key, data) {
    const full = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  },
  async download(key) {
    return fs.readFile(path.join(LOCAL_ROOT, key));
  },
  async remove(key) {
    await fs.rm(path.join(LOCAL_ROOT, key), { force: true });
  },
};

export function getStorage(): StorageProvider {
  switch (config.storage.provider) {
    case "supabase":
      return supabaseProvider;
    case "r2":
      // R2 is S3-compatible; wire up @aws-sdk/client-s3 here if adopted.
      throw new Error("R2 storage provider is not implemented in this MVP. Use STORAGE_PROVIDER=supabase or local.");
    case "local":
    default:
      return localProvider;
  }
}

export function buildArchiveKey(uploadId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return `uploads/${uploadId}/${safe}`;
}
