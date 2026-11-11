import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const entityTypes = new Set([
  "Account",
  "Customer",
  "Vendor",
  "Item",
  "Purchase",
  "PurchaseOrder",
  "Payment",
  "PaymentMethod",
  "BillPayment",
  "Transfer",
  "SalesReceipt",
  "RefundReceipt",
  "JournalEntry",
  "Invoice",
  "Bill",
  "VendorCredit",
  "Deposit",
]);
const reportTypes = new Set(["GeneralLedger", "BalanceSheet", "CashFlow"]);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function readObject(payload) {
  const value = JSON.parse(payload);
  if (!isObject(value)) throw new Error("Expected a QuickBooks JSON object.");
  const types = Object.keys(value).filter((key) => entityTypes.has(key));
  if (types.length === 0 && reportTypes.has(value.Header?.ReportName)) {
    if (!Array.isArray(value.Columns?.Column) || !isObject(value.Rows)) {
      throw new Error("Expected report Columns.Column and Rows.");
    }
    return [value.Header.ReportName, "", null, null];
  }
  if (types.length !== 1) throw new Error("Expected one supported QuickBooks entity.");
  const [type] = types;
  const entity = value[type];
  if (!isObject(entity) || typeof entity.Id !== "string" || !entity.Id.trim()) {
    throw new Error(`${type} requires a string Id.`);
  }
  const token = entity.SyncToken ?? null;
  const updated = entity.MetaData?.LastUpdatedTime ?? null;
  if (token !== null && typeof token !== "string") throw new Error("Invalid SyncToken.");
  if (updated !== null && (typeof updated !== "string" || !Number.isFinite(Date.parse(updated)))) {
    throw new Error("Invalid MetaData.LastUpdatedTime.");
  }
  return [type, entity.Id, token, updated];
}

async function main() {
  const [mode, target, ...args] = process.argv.slice(2);
  const byName = mode === "--company-name";
  const files = byName ? args : args.slice(1);
  if (!mode || !target?.trim() || !files.length || (!byName && !args[0]?.trim())) {
    throw new Error(
      "Usage: node scripts/import-quickbooks-json.mjs COMPANY_UUID REALM_ID FILE.json [FILE.json ...]",
    );
  }
  if (!process.env.DATABASE_URL) {
    try {
      loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL in the repository's .env file or in your environment.");
  }
  if (!byName && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(mode)) {
    throw new Error("Replace COMPANY_UUID with the UUID of the destination company.");
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  let imported = 0;
  try {
    await client.connect();
    await client.query("BEGIN");
    let companyId = mode;
    let realmId = args[0]?.trim();
    if (byName) {
      const { rows } = await client.query(
        "SELECT id FROM companies WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 2",
        [target],
      );
      if (rows.length !== 1) {
        throw new Error(rows.length ? "Company name is ambiguous." : "Company name not found.");
      }
      companyId = rows[0].id;
      realmId = `manual:${companyId}`;
    }
    for (const file of files) {
      const payload = (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
      let identity;
      try {
        identity = readObject(payload);
      } catch (error) {
        throw new Error(`${file}: ${error.message}`);
      }
      // Let PostgreSQL canonicalize JSON without rounding its numeric values in JavaScript.
      const canonical = await client.query(
        "SELECT COALESCE($1::jsonb -> $2::text, $1::jsonb)::text AS content",
        [payload, identity[1] ? identity[0] : null],
      );
      const digest = createHash("sha256").update(canonical.rows[0].content).digest("hex");
      const result = await client.query(
        `INSERT INTO quickbooks_import_objects
          (company_id, realm_id, object_type, external_id, sync_token, source_updated_at, digest, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [companyId, realmId, ...identity, digest, payload],
      );
      imported += result.rowCount;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
  console.log(`Stored: ${imported}. Duplicates: ${files.length - imported}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
