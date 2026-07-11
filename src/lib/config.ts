// Centralised runtime configuration derived from environment variables.
// All limits are configurable via env with the PRD defaults as fallbacks.

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return raw === "true" || raw === "1";
}

export const config = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",

  auth: {
    secret: process.env.NEXTAUTH_SECRET || "dev-insecure-secret-change-me",
    sessionCookie: "fl_session",
    sessionMaxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
  },

  storage: {
    // STORAGE_DRIVER is canonical; STORAGE_PROVIDER kept as a legacy alias.
    driver: (process.env.STORAGE_DRIVER || process.env.STORAGE_PROVIDER || "local").toLowerCase(),
    get provider() {
      return this.driver;
    },
    uploadDir: process.env.UPLOAD_DIR || "./storage/uploads",
    extractedDir: process.env.EXTRACTED_DIR || "./storage/extracted",
    reportDir: process.env.REPORT_DIR || "./storage/reports",
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    supabaseBucket: process.env.SUPABASE_BUCKET || "support-files",
  },

  // Default redaction policy (report/AI defaults; secrets are always redacted).
  redaction: {
    serialNumbers: boolEnv("REDACT_SERIAL_NUMBERS", true),
    ipAddresses: boolEnv("REDACT_IP_ADDRESSES", true),
    emails: boolEnv("REDACT_EMAILS", true),
    certificates: boolEnv("REDACT_CERTIFICATES", true),
    secrets: boolEnv("REDACT_SECRETS", true),
  },

  ai: {
    enabled: boolEnv("ENABLE_AI", false),
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    get enabled() {
      return !!(this.clientId && this.clientSecret);
    },
  },

  limits: {
    maxUploadBytes: intEnv("MAX_UPLOAD_SIZE_MB", 100) * 1024 * 1024,
    maxUploadMb: intEnv("MAX_UPLOAD_SIZE_MB", 100),
    maxExtractedBytes: intEnv("MAX_EXTRACTED_SIZE_MB", 500) * 1024 * 1024,
    maxExtractedMb: intEnv("MAX_EXTRACTED_SIZE_MB", 500),
    maxExtractedFiles: intEnv("MAX_EXTRACTED_FILES", 10000),
    // Only index individual text files up to this size (2 MB) to protect memory.
    maxIndexedFileBytes: 2 * 1024 * 1024,
  },

  retentionDays: intEnv("RETENTION_DAYS", 7),

  cron: {
    secret: process.env.CRON_SECRET || "",
    // Hostinger Cloud: one job per cron tick keeps memory/time within limits.
    batchSize: intEnv("CRON_BATCH_SIZE", 1),
  },

  supportedExtensions: [".tgz", ".tar.gz", ".tar", ".zip"] as const,
  // Single (non-archive) diagnostic files that are analyzed directly.
  supportedSingleFileExtensions: [".log", ".txt", ".json", ".xml"] as const,
};

export type AppConfig = typeof config;
