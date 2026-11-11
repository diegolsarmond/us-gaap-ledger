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

function readObjects(content, file) {
  const objects = [];
  const startOfObject = /\S/g;
  let offset = 0;
  while (offset < content.length) {
    startOfObject.lastIndex = offset;
    const start = startOfObject.exec(content)?.index;
    if (start === undefined) break;
    const location = `${file}, object ${objects.length + 1}, line ${content.slice(0, start).split("\n").length}`;
    if (content[start] !== "{") throw new Error(`${location}: Expected a JSON object.`);

    let depth = 0;
    let inString = false;
    offset = start;
    do {
      const char = content[offset++];
      if (inString) {
        if (char === "\\") offset++;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
      }
    } while (depth > 0 && offset < content.length);

    const payload = content.slice(start, offset);
    try {
      objects.push({ payload, identity: readObject(payload), location });
    } catch (error) {
      throw new Error(`${location}: ${error.message}`, { cause: error });
    }
  }
  if (!objects.length) throw new Error(`${file}: Expected at least one JSON object.`);
  return objects;
}

async function main() {
  const [mode, target, ...files] = process.argv.slice(2);
  const byName = mode === "--company-name";
  if (!mode || !target?.trim() || !files.length) {
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

  const objects = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const object of readObjects(content, file)) objects.push(object);
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
    let realmId = target.trim();
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
    for (const { payload, identity, location } of objects) {
      try {
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
      } catch (error) {
        throw new Error(`${location}: ${error.message}`, { cause: error });
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
  console.log(`Stored: ${imported}. Duplicates: ${objects.length - imported}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
