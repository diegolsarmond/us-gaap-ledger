import { readFileSync } from "node:fs";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  const tables = [
    "ledger_dimensions",
    "ledger_dimensions_options",
    "ledger_invoices_dimensionvalues",
    "ledger_bills_dimensionvalues",
    "ledger_journals_dimensionvalues",
  ];
  const status = async () =>
    (
      await client.query(
        "SELECT name,to_regclass(name) IS NOT NULL AS ready FROM unnest($1::text[]) name",
        [tables],
      )
    ).rows;
  if (process.argv.includes("--check")) {
    console.log(await status());
  } else {
    await client.query("SELECT pg_advisory_lock(803003)");
    for (const name of ["ledger_invoices", "ledger_bills", "ledger_journals"])
      if (
        !(await client.query("SELECT to_regclass($1) IS NOT NULL AS ready", [name])).rows[0].ready
      )
        throw new Error("Apply the structured ledger migrations before management dimensions.");
    await client.query(
      readFileSync(new URL("../database/025_management_dimensions.sql", import.meta.url), "utf8"),
    );
    if ((await status()).some((t) => !t.ready))
      throw new Error("Dimension schema verification failed.");
    console.log("Applied and verified migration 025. Existing company records were preserved.");
  }
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
