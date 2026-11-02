# Journal Entries v1

## Installation and use

Run migrations 001–019 first, then `npm run migrate:journals`. The command applies migrations 020 and 021 (including a forward upgrade for earlier draft installations). The migrations add new tables and preserves existing company and journal data. Re-running the migration command is safe. `npm run test:journals` creates and removes an isolated PostgreSQL schema; it does not seed the application with demo journals.

Use **Journal Entries** (`/journals`) to create and edit drafts, submit, approve/reject, post, reverse, inspect audit history and export the current filtered page to CSV. Only Posted entries affect official balances. Amounts enter the API as decimal strings; authoritative currency conversion and balancing use PostgreSQL NUMERIC. Functional currency follows the existing company setup (USD). Supply the applicable historical rate and its dated evidence; the existing live FX ticker is deliberately not used for historical postings. Posted rates and amounts never change when live quotes change.

**Accounting policies & access belongs to `/access`**. Select the company, then configure required approval, creator segregation, authorized opening date, and account posting rules. Approval/posting/reversal/soft-close grants extend existing Access Profiles; grants are global per profile, while company visibility and `write_accounting` are still enforced. Only users with `manage_profiles` can change settings. Existing administrators receive the four posting grants initially; other profiles start without them. New profiles require explicit grants. Account rules allow activation, posting restrictions, validity dates and required cost centers without changing the completed Chart of Accounts UI.

The existing fiscal status vocabulary is retained: Open, Soft-Close and Locked. Soft-Close requires a dedicated grant. Locked periods and the company accounting lock block posting. Reopening remains in the existing Fiscal Periods module with its existing authorization/audit. Posting never bypasses those locks with a free-text reason.

An Opening journal requires the configured migration date. Its posting is rejected if posted history already exists through that date, and only one posted opening per company is permitted. Import either opening balances or corresponding prior history, not both. Reclassification and adjustment journals preserve originals. A reversal is a new Posted entry with inverted amounts and its own authorized date; the original stays Posted and remains in balance reconstruction.

## API

Authentication uses the existing session cookie and company authorization. Pass `companyId` in the query or JSON body. Tenant IDs are never accepted as authorization input.

| Method | Path                                | Body / query                                                                                                          |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/journal-entries`              | `companyId`, `from`, `to`, `status`, `search`, `account`, `period`, `type`, `source`, `creator`, `costCenter`, `page` |
| POST   | `/api/journal-entries`              | `{companyId, value}`                                                                                                  |
| GET    | `/api/journal-entries/{id}`         | `companyId`                                                                                                           |
| PATCH  | `/api/journal-entries/{id}`         | `{companyId, version, value}`                                                                                         |
| POST   | `/api/journal-entries/{id}/submit`  | `{companyId, version}`                                                                                                |
| POST   | `/api/journal-entries/{id}/approve` | `{companyId, version}`                                                                                                |
| POST   | `/api/journal-entries/{id}/reject`  | `{companyId, version, reason}`                                                                                        |
| POST   | `/api/journal-entries/{id}/revise`  | `{companyId, version}`                                                                                                |
| POST   | `/api/journal-entries/{id}/post`    | `{companyId, version}`                                                                                                |
| POST   | `/api/journal-entries/{id}/reverse` | `{companyId, version, reason, reversalDate}`                                                                          |
| GET    | `/api/journal-entries/{id}/audit`   | `companyId`; detail response includes events and immutable audit IDs                                                  |
| POST   | `/api/accounting/events`            | `{companyId, value, source}`                                                                                          |
| GET    | `/api/accounting/balances`          | `companyId`, `from`, `to`                                                                                             |

`value` contains `journalType`, `accountingDate`, `description`, `reference`, `currency`, `exchangeRate`, `exchangeRateSource` and at least two `lines`. Each line has `accountCode`, `description`, decimal-string `debit`/`credit`, plus optional company-owned `costCenterId`, `projectId`, `customerId`, `vendorId`.

`source` requires `module`, `type`, `id`, `eventId`, positive `eventVersion`, `idempotencyKey` and `contractVersion: 1`. Retries return the same journal ID. The same key/event version with a different payload returns conflict. Automatic events enter Pending Approval unless company policy waives approval and the actor has posting permission, in which case posting is atomic. Failed events roll back entirely and are recorded in Action Logs.

All edits and transitions require the latest integer `version`. Posting revalidates permissions, dimensions, dates, exact transaction and functional totals and locks the company within the same transaction used by existing parameter writers. Journal numbering is allocated by company at posting, independently of draft UUIDs. Posted header/line changes and deletion are blocked by database triggers. Deferred constraints enforce balancing and company-owned foreign keys. Approval decisions and full snapshots are stored in the existing structured Action Logs; journal events are append-only references to those snapshots.

## GL integration and next Trial Balance module

The posting engine owns `journal_entries` / `journal_entry_lines`. Existing journals remain in their original storage. `journal-projection.server.ts` exposes only new Posted records to existing readers with a `JE:` prefix; legacy full-state saves filter those read-only projections so they cannot duplicate or rewrite the new book. Legacy direct manual post/reverse commands are disabled in favor of this engine. No operational module should write the new GL tables directly.

`GET /api/accounting/balances` uses exact SQL aggregation over existing posted history and new Posted entries. Opening = sum(debit-credit) before `from`; movement = debits/credits in the inclusive range; closing = opening + debits - credits. Debit/credit presentation uses the positive/negative parts, irrespective of normal account nature. Opening journals are ordinary history and are never added a second time. Reversed legacy originals remain included alongside counterentries.

The deployment currently has no shared-database tenant registry: existing users/profiles authorize companies globally within one installation. Migration 020 creates one trusted installation tenant and scopes new journal records to that tenant plus company, including composite ownership constraints. This preserves the existing one-deployment-per-tenant model; shared-database SaaS tenants would require a separate authentication/company tenancy migration across the existing modules.

The next Trial Balance UI can consume the balance endpoint and drill down through the journal list using account, dates and Posted status. Cross-entity currency conversion/consolidation, periodic FX remeasurement, recurring templates and operational event mappings remain separate future work. XLSX export and supporting-document attachments (recommended rather than mandatory in v1 requirements) are not included; CSV export is available.

## Verification

- `npm run test:journals`: workflow, exact rounding, approval segregation, rejected writes, closed periods, opening balances, invalid accounts/dimensions, FX snapshots, immutable GL, idempotency, rollback, profile/company scope, audit, concurrent event retries and posting, legacy read compatibility.
- `npm run test:structured-storage`: existing storage and parameter integrations, new projection persistence safety and absence of persisted JSON columns.
- `npx tsc --noEmit`, targeted ESLint and `npm run build`.
  Drafts may retain an empty event description, unselected accounts and zero/blank amounts while the date, company currency and rate remain valid. Migration 022 enables that storage without weakening posted-entry constraints. Submit and Post require the operational description, analytical accounts, required dimensions and valid positive single-sided lines, with exact balance in both currencies. Entering a positive Debit clears Credit on that line and vice versa. Native date controls send ISO values; the UI also shows the English month name to disambiguate regional date rendering.
