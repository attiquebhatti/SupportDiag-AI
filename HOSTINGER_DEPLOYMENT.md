# Deploying SupportDiag AI on Hostinger

This guide deploys **SupportDiag AI** as a Node.js / Next.js application on **Hostinger
Cloud Hosting / Hostinger Node.js hosting** — no Docker, Redis, Celery, daemons, or
Vercel-specific features. Background work runs through database-backed jobs plus
Hostinger cron jobs.

**Architecture:** Next.js app on Hostinger · **Hostinger MySQL/MariaDB** via Prisma ·
**local disk storage** under `./storage` (outside the web root, served only through
authenticated APIs) · optional OpenAI-compatible API for the AI Investigator.

---

## 1. Create a subdomain

In **hPanel → Domains → Subdomains**, create e.g. `supportdiag.yourdomain.com`.

## 2. Create the Node.js application

In **hPanel → Advanced → Node.js** (Setup Node.js App):

- **Node version:** 20.x or the latest stable supported
- **Application root:** the subdomain folder
- **Application URL:** your subdomain

## 3. Upload the code

Any of:

- **GitHub deployment** (recommended): hPanel → Git → connect
  `https://github.com/attiquebhatti/SupportDiagAI-v2` (branch `main`), enable auto-deploy
- **File Manager / FTP**: upload the project (excluding `node_modules`, `.next`, `.env`)
- **SSH**: `git clone` into the app root if SSH is available

## 4–5. Build & start commands

Build:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
```

Start:

```bash
npm start
```

`npm start` runs `next start`, which honors Hostinger's `$PORT` automatically.

## 6. Environment variables

In the Node.js app **Environment variables** section, set everything from
[`.env.example`](.env.example) — at minimum:

```
NEXT_PUBLIC_APP_NAME=SupportDiag AI
NEXT_PUBLIC_APP_URL=https://supportdiag.yourdomain.com
NEXTAUTH_URL=https://supportdiag.yourdomain.com
NEXTAUTH_SECRET=<openssl rand -base64 32>
DATABASE_URL=mysql://DB_USER:DB_PASSWORD@DB_HOST:3306/DB_NAME
STORAGE_DRIVER=local
UPLOAD_DIR=./storage/uploads
EXTRACTED_DIR=./storage/extracted
REPORT_DIR=./storage/reports
OPENAI_API_KEY=<key or blank>
ENABLE_AI=false
MAX_UPLOAD_SIZE_MB=100
MAX_EXTRACTED_SIZE_MB=500
MAX_EXTRACTED_FILES=10000
RETENTION_DAYS=7
CRON_SECRET=<openssl rand -hex 24>
NODE_ENV=production
```

## 7–8. Create the MySQL database

1. **hPanel → Databases → MySQL Databases** → create a database + user, note the host
   (often `localhost` from the app, or an internal hostname), database name, user, password.
2. Set `DATABASE_URL` accordingly:
   `mysql://USER:PASSWORD@HOST:3306/DBNAME`

## 9. Run the Prisma migration

From SSH in the app root (or as part of the build command above):

```bash
npx prisma migrate deploy
npm run seed        # registers vendor parsers + diagnostic rules only in production
```

> The production seed **skips demo users** — create your admin account through the
> app's register page (the first account becomes Admin).

## 10–11. Storage folders & permissions

The app creates `storage/uploads`, `storage/extracted`, and `storage/reports`
automatically on first use (also verifiable on the **System Health** page). If your
hosting requires it, create them manually and ensure the app user can write:

```bash
mkdir -p storage/uploads storage/extracted storage/reports
chmod 750 storage storage/*
```

These folders live in the app root — **outside the public web root**. Uploaded bundles
are never exposed via public URLs; all file access goes through authenticated API routes.

## 12. Configure Hostinger cron jobs

**hPanel → Advanced → Cron Jobs**:

Every 5–10 minutes (advances the analysis queue, one job per tick):

```bash
curl -s "https://supportdiag.yourdomain.com/api/cron/process-pending-jobs?key=<CRON_SECRET>"
```

Once per day (retention cleanup):

```bash
curl -s "https://supportdiag.yourdomain.com/api/cron/cleanup-expired-files?key=<CRON_SECRET>"
```

Both endpoints also accept `Authorization: Bearer <CRON_SECRET>` via POST.

## 13. Enable SSL

hPanel → SSL → issue the free Let's Encrypt certificate and force HTTPS. Confirm
`NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL` use `https://`.

## 14. Test the deployment

1. **Login/Register** — first account becomes Admin
2. **System Health** (sidebar, admin) — database connected, storage writable, cron secret set
3. **Upload** — New Diagnostic Analysis wizard with a PAN-OS `.tgz`
4. **Processing** — status page reaches *completed* (or wait for the cron tick)
5. **Diagnostic Findings / Evidence Explorer / Timeline**
6. **AI Investigator** — with `ENABLE_AI=false` it returns raw evidence; set a key to test full AI
7. **Report export** — HTML + Markdown downloads
8. **Delete upload** — purges the archive from `storage/uploads` and derived data

---

## Migrating from Vercel + Neon (PostgreSQL) to Hostinger + MySQL

The project's primary Prisma provider is now `mysql`, and no Vercel-specific features
are used (no Vercel Blob/Cron/Edge APIs — cron endpoints are plain HTTP, storage is
driver-based).

1. **Fresh install (no data to keep):** just follow this guide top-to-bottom — the
   committed migrations in `prisma/migrations` are MySQL-native.
2. **Keeping existing Neon data:** export the data you need (e.g. `pg_dump --data-only`
   per table or CSV), create the MySQL schema with `npx prisma migrate deploy`, and
   re-import (adjusting types). For most pre-launch installs, re-uploading the support
   bundles is simpler than data migration.
3. **Staying on PostgreSQL instead (optional):** change `provider` in
   `prisma/schema.prisma` back to `postgresql`, remove the `@db.LongText` annotations
   (use plain `String`), delete `prisma/migrations`, and regenerate a baseline with
   `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.
   Never point `--shadow-database-url` at a live database.

## Hostinger operational notes

- **One job per cron tick** (`CRON_BATCH_SIZE=1`) keeps memory/time within Cloud limits;
  the "Process Now" button and post-upload trigger process immediately when possible.
- Processing is in-memory: keep `MAX_UPLOAD_SIZE_MB` realistic (100–200 MB) for Cloud
  hosting. Very large bundles are a **future VPS processing engine** concern.
- Do not commit `.env`; keep all secrets in the hPanel environment UI.
