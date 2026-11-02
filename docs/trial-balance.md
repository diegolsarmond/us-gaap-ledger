# Trial Balance

Read-only report at `/trial-balance`; adjustments are made through Journal Entries.

`GET /api/trial-balance?companyId=<uuid>&start=2026-11-01&end=2026-11-30`

The endpoint also accepts `costCenter`, `accountType`, `search`, `showZero`, `view`, `account`, and zero-based `page` (100 activity lines). Decimal values are returned as strings. The account report includes opening balances and a running balance across all pages. Global indicators precede display and cost-center filters; subset indicators describe the displayed analysis. Account groups are informational and never enter totals twice.

Authentication and company permissions use the existing company authorization service. Tenant identity is read from the deployment's singleton accounting tenant, matching Journal Entries. Reads and report audit events run in a repeatable-read transaction. Posted engine lines use stored base amounts. Legacy posted journals, including reversed originals, use their existing functional amounts and participate exactly once through a separate source union.

Reports refresh on focus and every 15 seconds. CSV, XLSX and PDF exports generate an audited fresh snapshot with entity, dates, functional currency, filters, totals, status and generation time. XLSX decimal cells remain text to preserve exact amounts beyond spreadsheet numeric precision. Standard and Detailed views are supported. Formal adjustment cutoffs and post-closing variants are intentionally unavailable until the posting model supplies reliable closing metadata. No balances are persisted independently.

Run `npm run test:trial-balance` against the configured PostgreSQL instance. The test creates and removes an isolated schema. It excludes the existing company-specific seed script, which requires a fixed production company ID and prevents the existing Journal Entries suite from initializing an empty test schema.
