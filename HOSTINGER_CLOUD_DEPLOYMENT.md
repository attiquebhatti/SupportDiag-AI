# Deploying FirewallLens AI to Hostinger Cloud (Startup plan)

This guide deploys FirewallLens AI as a **Node.js / Next.js** application on the **Hostinger
Cloud Startup** plan — **no VPS, Docker, Redis, Celery, FastAPI, Python workers, or local
PostgreSQL**. Background work is handled by database-backed jobs plus Hostinger cron jobs.

**Architecture:** Next.js app on Hostinger · managed Postgres on **Neon** · object storage on
**Supabase Storage** · OpenAI-compatible API for AI.

---

## 1. Create a subdomain

In **hPanel → Domains → Subdomains**, create e.g. `firewalllens.thecyberadviser.com`.
Note the document root Hostinger assigns; the Node.js app will bind to this subdomain.

## 2. Create the Node.js application

In **hPanel → Advanced → Node.js** (Setup Node.js App):

- **Node version:** 20.x or newer
- **Application root:** the subdomain folder
- **Application URL:** your subdomain
- **Application startup file:** leave as generated; the process is started via `npm start`

## 3. Connect your GitHub repository

- Push this project to a GitHub repo.
- In hPanel → **Git**, connect the repository and branch (e.g. `main`) into the app root, or
  deploy via SSH `git pull`. Enable auto-deploy on push if available.

## 4. Set the build command

In the Node.js app settings (or your deploy script), set the build command:

```bash
npm install && npx prisma generate && npm run build
```

> `prisma generate` must run during build so the Prisma Client is available at runtime.

## 5. Set the start command

```bash
npm start
```

This runs `next start` on the port Hostinger provides via `$PORT` (Next.js respects it).

## 6. Add environment variables

In the Node.js app **Environment variables** section, add everything from `.env.example`:

```
NEXT_PUBLIC_APP_URL=https://firewalllens.thecyberadviser.com
DATABASE_URL=postgresql://...pooler.neon.tech/...?sslmode=require
DIRECT_URL=postgresql://...neon.tech/...?sslmode=require
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://firewalllens.thecyberadviser.com
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_BUCKET=support-files
OPENAI_API_KEY=<key or blank>
OPENAI_MODEL=gpt-4.1-mini
ENABLE_AI=true
MAX_UPLOAD_SIZE_MB=100
MAX_EXTRACTED_SIZE_MB=500
MAX_EXTRACTED_FILES=10000
RETENTION_DAYS=7
CRON_SECRET=<openssl rand -hex 24>
```

Restart the app after saving.

## 7. Create the Neon PostgreSQL database

1. Sign up at [neon.tech](https://neon.tech) and create a project (choose a region near your users).
2. Copy the **pooled** connection string → `DATABASE_URL` (host contains `-pooler`).
3. Copy the **direct** connection string → `DIRECT_URL`.
4. Append `?sslmode=require` if not already present.

## 8. Run Prisma migrations

From an SSH session in the app root (or a one-off deploy step):

```bash
npx prisma migrate deploy      # applies committed migrations (0001_init + multivendor)
```

Then run the seed — it creates demo users **and** populates the vendor parser and
diagnostic rule registries used by the Vendor Parsers page:

```bash
npm run seed
```

> Upgrading an existing deployment? `prisma migrate deploy` applies the `multivendor`
> migration additively (new columns/tables only — existing uploads and findings are kept).
> Re-run `npm run seed` afterward to register parsers/rules. Older cases will show
> "Unknown / Generic" vendor badges until re-processed.

## 9. Create the Supabase Storage bucket

1. Create a project at [supabase.com](https://supabase.com).
2. **Storage → Create bucket** named `support-files` (keep it **Private**).
3. **Project Settings → API** → copy the **Project URL** → `SUPABASE_URL` and the
   **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server-side only — never expose it client-side).

> For the very first MVP smoke test you may set `STORAGE_PROVIDER=local` to store archives on
> the app's local disk, then switch to `supabase` for real use.

## 10. Test the upload flow

1. Visit your subdomain, **register** the first user (becomes Admin).
2. Go to **Upload**, drop a PAN-OS support file (`.tgz`/`.tar.gz`/`.tar`/`.zip`).
3. You are redirected to the **status** page; watch it progress to *completed*, then review the
   overview, findings, file explorer, and search.

## 11. Cron job — process pending jobs

In **hPanel → Advanced → Cron Jobs**, add a job every 2–5 minutes:

```bash
curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" \
  https://firewalllens.thecyberadviser.com/api/cron/process-pending-jobs
```

(If Hostinger's cron only supports GET/`wget`, the endpoint also accepts
`GET .../api/cron/process-pending-jobs?key=<CRON_SECRET>`.)

This advances any uploads whose in-request processing timed out or failed.

## 12. Cron job — cleanup expired files

Add a daily job:

```bash
curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" \
  https://firewalllens.thecyberadviser.com/api/cron/cleanup-expired-files
```

It purges archives and extracted content older than `RETENTION_DAYS`.

## 13. Enable SSL

In **hPanel → SSL**, issue/enable the free Let's Encrypt certificate for the subdomain and
force HTTPS. Confirm `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` use `https://`.

## 14. Test AI-disabled mode

Set `ENABLE_AI=false` and restart. Upload + analysis still work; the AI assistant returns the
most relevant **evidence** for manual review instead of an LLM answer, and the overview shows a
deterministic summary. This confirms the app is fully functional without an AI key.

## 15. Test AI-enabled mode

Set `ENABLE_AI=true` and a valid `OPENAI_API_KEY` (and `OPENAI_MODEL`), restart, then ask the
AI assistant a question. Answers follow the strict **Answer / Evidence / Interpretation /
Recommended Next Steps / Confidence** format and only use redacted evidence from the uploaded
file. If there is no evidence it replies: *"I could not find evidence for this in the uploaded
support file."*

---

### Operational notes for Hostinger Cloud

- **No long-running daemons.** All heavy work happens inside a single request (upload-triggered
  or cron-triggered). Large bundles are handled by the cron queue in small batches
  (`CRON_BATCH_SIZE`, default 2).
- **Connection pooling.** Use Neon's **pooled** `DATABASE_URL` to avoid exhausting connections
  under serverless-style request handling; `DIRECT_URL` is only for migrations.
- **Upload size.** `next.config.mjs` sets a 110 MB server-action body limit; keep
  `MAX_UPLOAD_SIZE_MB` at/below your plan's request size limit.
- **Do not commit** `.env`. Set all secrets in the Hostinger environment variables UI.
