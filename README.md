# SupportDiag AI

**AI-powered support file diagnostics for security and network teams.**

SupportDiag AI is an AI-assisted diagnostic platform that helps engineers analyze support files, logs, and troubleshooting bundles from firewalls, security platforms, and infrastructure systems. Upload a
vendor support bundle — firewall tech support files, Panorama exports, Cortex XDR/XSIAM log
bundles, diagnostic archives, or raw logs — and get safe extraction, structured parsing,
evidence-based findings, a health score, an evidence-grounded AI Investigator, and exportable
troubleshooting reports.

> ⚠️ **Disclaimer:** This is an independent diagnostic assistant. It is **not** an official
> tool from Palo Alto Networks, Check Point, Fortinet, or any vendor, and it **does not
> replace official vendor TAC support**.

---

## Vendor coverage

| Vendor | Product | Status | Parser maturity |
|---|---|---|---|
| Palo Alto Networks | NGFW / PAN-OS | ✅ Supported | High |
| Palo Alto Networks | Panorama | ✅ Supported | Medium |
| Palo Alto Networks | Cortex XDR | 🧪 Beta (generic log analysis) | Low |
| Palo Alto Networks | Cortex XSIAM | 🧪 Beta (generic log analysis) | Low |
| Check Point | Gateway / Management / Maestro-VSX | 🗓 Planned (Phase 2) | Low |
| Fortinet | FortiGate / FortiManager / FortiAnalyzer | 🗓 Planned (Phase 2) | Low |

Vendor/product is **auto-detected** from archive structure, filenames, command outputs, and
version strings — or can be selected explicitly in the upload wizard. Unknown bundles still get
generic error/timeline analysis with a "Low" parser-confidence label.

## Features

- 🎛 **Security operations console UI** — dark-mode-first premium shell: sidebar navigation,
  workspace selector, global header, role badges, theme toggle
- 📊 **SOC-style dashboard** — hero stats, fleet health gauge, severity donut, category bars,
  vendor coverage cards, recommended actions, failed-processing panel with retry
- 🧙 **4-step upload wizard** ("New Diagnostic Analysis") — vendor → product → file → options
- 🧯 **Safe extraction** — path-traversal protection, size/count limits, never executes files;
  accepts `.tgz .tar.gz .tar .zip` archives plus single `.log .txt .json .xml` files
- 🧩 **Registry-driven multi-vendor architecture** — `VendorParserRegistry` +
  `DiagnosticRuleRegistry` map each detected product to its parser modules and rule sets
- 🚦 **60+ diagnostic rules** across PAN-OS (system health, HA, interfaces, routing, VPN,
  Panorama, commit/config incl. any-any allow, licensing/content), Panorama management,
  Cortex XDR/XSIAM (agents, brokers, ingestion, parsing/correlation/dataset/XQL), and
  vendor-neutral log/crash rules
- 🗂 **Case workspace** — Overview (badges, confidence, health), Findings console, Evidence
  view, File Explorer (Monaco + redaction toggle), **Timeline**, Search, AI Investigator, Reports
- 🤖 **AI Investigator** — evidence-grounded Q&A with product-specific suggested questions and a
  strict Answer / Evidence / Interpretation / Next Steps / Confidence format; never hallucinates,
  never claims TAC confirmation, degrades gracefully when AI is disabled
- 📄 **Report templates** — Executive Summary, Technical Troubleshooting, Customer-Facing,
  Internal Engineering Notes; HTML or Markdown; redaction on by default; analyst notes included
  in internal reports
- 🔐 **Redaction engine** — passwords, keys, tokens, certificates, PSKs, emails, serials,
  public IPs always; private IPs / internal FQDNs optional
- 🧹 **Hostinger-friendly jobs** — DB-backed job states + protected cron endpoints; no Docker,
  Redis, Celery, or daemons

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Radix/shadcn-style UI ·
TanStack Table · Recharts · Monaco Editor · next-themes · Prisma · **MySQL/MariaDB** (Hostinger; PostgreSQL optional) ·
local disk storage (Supabase/S3 optional drivers) · OpenAI-compatible API.

## Database options

- **MySQL / MariaDB (default)** — matches Hostinger hPanel databases; the committed
  Prisma migrations are MySQL-native. Local dev: `docker run -d --name supportdiag-mysql -e MYSQL_DATABASE=supportdiag -e MYSQL_USER=supportdiag -e MYSQL_PASSWORD=pw -e MYSQL_ROOT_PASSWORD=rootpw -p 3306:3306 mysql:8`
- **PostgreSQL (optional)** — switch `provider` to `postgresql` in `prisma/schema.prisma`,
  drop the `@db.LongText` annotations, delete `prisma/migrations`, and regenerate a
  baseline (`prisma migrate diff --from-empty --to-schema-datamodel …`).

## Quick start (local)

```bash
npm install
cp .env.example .env        # set DATABASE_URL (MySQL), NEXTAUTH_SECRET; STORAGE_DRIVER=local
npx prisma migrate deploy   # applies the committed MySQL migrations
npm run seed                # demo users + vendor parser & diagnostic rule registries
npm run dev                 # http://localhost:3000
```

Seed users (password `ChangeMe123!`): `admin@` / `engineer@` / `viewer@supportdiag.local`.
The first account you register yourself becomes Admin.

## Architecture

```
src/lib/vendors.ts            vendor/product taxonomy, categories, suggested questions
src/lib/detection.ts          vendor/product auto-detection + confidence scoring
src/lib/parsers/              PAN-OS parsers, Panorama, Cortex XDR/XSIAM, generic-log
src/lib/parsers/registry.ts   VendorParserRegistry (product → parser modules)
src/lib/rules/                rule sets per product family
src/lib/rules/registry.ts     DiagnosticRuleRegistry (product → rule set)
src/lib/processing.ts         pipeline: extract → detect → parse → asset → rules → score → AI summary
src/lib/report.ts             report templates (executive/technical/customer/internal)
src/app/(app)/                console pages: dashboard, upload wizard, cases, findings,
                              investigator, parsers, reports, knowledge-base, settings,
                              and the per-case workspace under /uploads/[id]/*
```

**Analysis pipeline** (all inside one request or a cron tick — no workers):
`upload → validate → store archive → extract safely → index text → detect vendor/product →
run product parser set → derive Device + normalized Asset → run product rule set → health
score → AI executive summary → complete`.

## Background processing

- `POST /api/uploads/[id]/process` — immediate in-request processing (upload wizard calls this)
- `POST|GET /api/cron/process-pending-jobs` — cron-driven queue advance (batch, retries)
- `POST|GET /api/cron/cleanup-expired-files` — retention cleanup

Cron endpoints require `Authorization: Bearer $CRON_SECRET` or `?key=$CRON_SECRET`.

## PAN-OS TSF diagnostics (Phase 1A)

Deep Tech Support File analysis for PAN-OS / Panorama, built on an
evidence-first pipeline (raw file → normalized artifact → parsed data → rules →
known-issue match → findings → report):

- **Artifact normalization registry** (`src/lib/panos/artifacts.ts`) maps physical
  TSF paths to stable logical families (SYSTEM_LOG, HA_AGENT_LOG, DP_MONITOR_LOG,
  GLOBALPROTECT_SERVICE_LOG, CORES, SDB, …) across platform/slot variations, builds
  a per-case **manifest**, and flags **missing expected evidence**.
- **CLI snapshot parser** (`src/lib/panos/cli-snapshot.ts`) fuzzily splits a
  monolithic techsupport dump into per-command virtual files, so every existing
  parser becomes TSF-aware without depending on exact header formatting.
- **Version-awareness layer** (`src/lib/panos/version.ts`) turns the detected
  PAN-OS version into an evidence model: GlobalProtect log selection
  (appweb3-sslvpn.log ≤10.1 vs gpsvc.log ≥10.2), process availability
  (distributord 10.0+, reportd 10.1+), timestamp precision notes, and decryption
  applicability (11.1+). Version-specific conclusions always carry the version.
- **Version-aware known-issue engine** (`src/lib/known-issues`) matches symptom
  signatures against evidence with conservative match types (Exact Match / Strong
  Candidate / Possible Match), respecting affected/fixed version ranges, required
  evidence families, and exclusions. Seeded with documented issue *families*
  (placeholders to verify against vendor docs) — never asserts a specific defect.
- Surfaced in the case workspace: **Known Issues** tab (matches + clickable
  evidence + remediation) and an **Analysis Completeness** widget on the overview.

**Deep analyzers** (`src/lib/panos/analyzers`) run after parsing on PAN-OS cases:
  Resource Health (OOM, pan_task, packet-diag, disk), Crash/Core (identify +
  correlate, no binary decode), Commit-Failure (ID population / DB corruption),
  HA (split-brain, peer-down, out-of-sync + transition events), and Interface
  (CRC/FCS counters, link flaps) — each emitting an enriched finding
  (plane / probable cause / alternatives / correlation) plus structured timeline
  events. An **event-correlation engine** links events by shared process and
  time window (e.g. OOM → crash → reboot cascades) and annotates findings.

Unit tests: `npm test` (16 checks across `test/panos-*.test.ts`). The multi-vendor
architecture and generic-log path are unchanged.

## Roles & access control (RBAC)

| Capability | Viewer | Engineer | Admin |
|---|---|---|---|
| Browse dashboard, cases, findings, evidence, files, timeline | ✅ | ✅ | ✅ |
| Download existing reports | ✅ | ✅ | ✅ |
| Upload & process support bundles | — | ✅ | ✅ |
| Triage findings + analyst notes | — | ✅ | ✅ |
| Ask AI Investigator questions | — | ✅ | ✅ |
| Generate reports | — | ✅ | ✅ |
| Delete cases | own only | ✅ | ✅ |
| Team management (roles, remove users) | — | — | ✅ |

Enforcement is server-side in every API route; the UI additionally hides actions the
current role cannot perform. Admins manage members on the **Team** page. Safety rails:
you cannot change your own role, and the last admin cannot be demoted or deleted.

## Google sign-in (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an
   **OAuth client ID** (type *Web application*).
2. Add `<NEXTAUTH_URL>/api/auth/google/callback` as an **Authorized redirect URI**
   (e.g. `https://supportdiag.example.com/api/auth/google/callback`, or
   `http://localhost:3000/api/auth/google/callback` for local dev).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the environment and restart.

The "Continue with Google" button appears automatically once configured. Google accounts
are linked to existing users by email; new Google signups default to the Engineer role
(the very first user in an empty system still becomes Admin). Password login is unaffected;
Google-only accounts have no password.

## Single sign-on from TheCyberAdviser (optional)

SupportDiag can accept users from the TheCyberAdviser site without a separate
signup. Set `SUPPORTDIAG_SSO_SECRET` to a value shared with the site; the site
mints a short-lived HS256 ticket for a signed-in user, and `/api/auth/sso?ticket=…`
verifies it, finds-or-creates the user by email (default role Engineer, first user
Admin), and establishes the session. Direct email/password and Google login remain
available. Leave the secret blank to disable SSO.

## Security & privacy

- Extension + size validation; extracted size/count caps; `..`/absolute paths rejected
- Uploaded files are never executed; only text files are indexed
- Secrets redacted before AI processing and (by default) in reports and file views
- Case deletion purges the stored archive and all extracted/derived data
- Independent tool — findings are heuristic and should be validated by a qualified engineer

## Deployment

See **[HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md)**. Build:
`npm install && npx prisma generate && npm run build` · Start: `npm start`.
No Docker, Redis, Celery, or long-running daemons required.

## License

Provided as an MVP scaffold for the SupportDiag AI project.
