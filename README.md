# FirewallLens AI

**AI-assisted security support file analysis for faster troubleshooting.**

FirewallLens AI is an independent, multi-vendor cybersecurity diagnostic platform. Upload a
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
TanStack Table · Recharts · Monaco Editor · next-themes · Prisma · PostgreSQL (Neon/Supabase) ·
Supabase Storage · OpenAI-compatible API.

## Quick start (local)

```bash
npm install
cp .env.example .env        # set DATABASE_URL/DIRECT_URL, NEXTAUTH_SECRET; STORAGE_PROVIDER=local for testing
npx prisma migrate deploy   # applies committed migrations (0001_init + multivendor)
npm run seed                # demo users + vendor parser & diagnostic rule registries
npm run dev                 # http://localhost:3000
```

Seed users (password `ChangeMe123!`): `admin@` / `engineer@` / `viewer@firewalllens.local`.
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

## Security & privacy

- Extension + size validation; extracted size/count caps; `..`/absolute paths rejected
- Uploaded files are never executed; only text files are indexed
- Secrets redacted before AI processing and (by default) in reports and file views
- Case deletion purges the stored archive and all extracted/derived data
- Independent tool — findings are heuristic and should be validated by a qualified engineer

## Deployment

See **[HOSTINGER_CLOUD_DEPLOYMENT.md](HOSTINGER_CLOUD_DEPLOYMENT.md)**. Build:
`npm install && npx prisma generate && npm run build` · Start: `npm start`.
No Docker, Redis, Celery, or long-running daemons required.

## License

Provided as an MVP scaffold for the FirewallLens AI project.
