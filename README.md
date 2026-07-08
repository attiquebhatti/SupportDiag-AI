# FirewallLens AI

**AI-assisted firewall support file analysis for faster troubleshooting.**

FirewallLens AI is an independent, AI-assisted analyzer for Palo Alto Networks PAN-OS
tech support files. Network security engineers can upload a support bundle, have it safely
extracted and parsed, review auto-generated health findings, search the raw evidence, ask
evidence-grounded AI questions, and export a troubleshooting report.

> ⚠️ **Disclaimer:** This is an independent diagnostic assistant. It is **not** an official
> Palo Alto Networks tool and **does not replace Palo Alto Networks TAC**.

---

## Features

- 🔐 Email/password auth with JWT sessions and **Admin / Engineer / Viewer** roles
- ⬆️ Upload `.tgz`, `.tar.gz`, `.tar`, `.zip` support bundles (validated, size-limited)
- 🧯 **Safe extraction** — path-traversal protection, size/count limits, never executes files
- 🧩 Modular **parser framework** (system info, config, HA, interfaces, routing, BGP/OSPF,
  IPSec/IKE, licensing, content versions, Panorama, commits, logs, MP/DP resources)
- 🚦 **Rule engine** with 25+ diagnostic rules across System Health, HA, Interfaces, Routing,
  VPN, Panorama, Config, and Licensing
- 📊 Findings dashboard, health score (0–100 with bands), and device overview
- 🗂️ File explorer with Monaco viewer + redaction toggle
- 🔎 Global keyword/regex search with highlighted matches
- 🤖 Evidence-grounded AI assistant (strict "answer only from evidence" format)
- 📄 HTML / Markdown report export with redaction on by default
- 🧹 Database-backed jobs + cron endpoints (no Redis/Celery/daemons) — **Hostinger Cloud friendly**

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Radix/shadcn-style UI ·
TanStack Table · Recharts · Monaco Editor · Prisma · PostgreSQL (Neon/Supabase) ·
Supabase Storage · OpenAI-compatible API.

## Quick start (local)

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
#   set DATABASE_URL / DIRECT_URL (Neon or local Postgres), NEXTAUTH_SECRET,
#   STORAGE_PROVIDER=local (for quick testing), and optionally OPENAI_API_KEY

# 3. Create the schema
npx prisma migrate dev --name init      # or: npx prisma db push

# 4. (optional) seed demo users
npm run seed        # admin@firewalllens.local / ChangeMe123!  (+ engineer, viewer)

# 5. Run
npm run dev         # http://localhost:3000
```

The **first account you register becomes the Admin** and creates the default organization.

## Environment variables

See [`.env.example`](.env.example). Key ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Pooled + direct Postgres connection strings |
| `NEXTAUTH_SECRET` | Signs session JWTs (`openssl rand -base64 32`) |
| `STORAGE_PROVIDER` | `supabase` (prod) or `local` (MVP testing) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_BUCKET` | Object storage |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `ENABLE_AI` | AI assistant (set `ENABLE_AI=false` to disable) |
| `MAX_UPLOAD_SIZE_MB` / `MAX_EXTRACTED_SIZE_MB` / `MAX_EXTRACTED_FILES` | Limits |
| `RETENTION_DAYS` | Auto-cleanup window |
| `CRON_SECRET` | Bearer secret for `/api/cron/*` endpoints |

## Background processing (no Redis/Celery)

Uploads create an `AnalysisJob` row with status `PENDING`. Processing runs either:

1. **Immediately** — the upload page calls `POST /api/uploads/[id]/process` (best-effort, in-request), or
2. **Via cron** — `POST /api/cron/process-pending-jobs` picks up pending/failed jobs in small batches.

Two cron endpoints (protected by `CRON_SECRET`) drive the system:

- `/api/cron/process-pending-jobs` — advances the analysis queue
- `/api/cron/cleanup-expired-files` — purges archives/content past `RETENTION_DAYS`

Call them with `Authorization: Bearer $CRON_SECRET` or `?key=$CRON_SECRET`.

## Security & privacy

- File extension + size validated before storage; extracted size/count capped.
- Path-traversal entries (`..`, absolute paths) are rejected during extraction.
- Uploaded files are **never executed**; only text files are indexed.
- Secrets (passwords, API keys, tokens, private keys, certificates, PSKs, emails, serials,
  public IPs) are redacted before AI processing and, by default, in reports. Private IPs and
  internal FQDNs are optional toggles.
- Users can delete a case to purge its archive + extracted content; a retention cron also cleans up.

## Deployment

See **[HOSTINGER_CLOUD_DEPLOYMENT.md](HOSTINGER_CLOUD_DEPLOYMENT.md)** for step-by-step
Hostinger Cloud Startup instructions (subdomain, Node.js app, GitHub, Neon, Supabase, cron, SSL).

Build / start commands:

```bash
# build
npm install && npx prisma generate && npm run build
# start
npm start
```

## Project structure

```
prisma/schema.prisma          Prisma models
src/lib/                       config, auth, storage, extraction, redaction, ai, health, report, processing
src/lib/parsers/              modular parser framework (BaseParser implementations)
src/lib/rules/                diagnostic rule engine + rule groups
src/app/api/                  route handlers (auth, uploads, processing, analysis, files, ai, reports, cron)
src/app/(app)/               authenticated pages (dashboard, upload, analysis workspace, settings)
src/components/               UI primitives + feature components
```

## License

Provided as an MVP scaffold for the FirewallLens AI project.
