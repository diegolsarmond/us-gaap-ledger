import pg from "pg";
import { readFileSync } from "node:fs";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  if ((await client.query("SELECT to_regclass('journal_entries') AS name")).rows[0].name) {
    console.log("Journal Entries migration is already installed.");
  } else {
    if (!(await client.query("SELECT to_regclass('system_audit_fields') AS name")).rows[0].name)
      throw new Error("Apply migrations 001–019 before Journal Entries.");
    await client.query(
      readFileSync(new URL("../database/020_journal_entries.sql", import.meta.url), "utf8"),
    );
    console.log(
      "Applied 020_journal_entries.sql. Existing company, account and journal data preserved.",
    );
  }
  await client.query(
    readFileSync(new URL("../database/021_journal_entries_upgrade.sql", import.meta.url), "utf8"),
  );
  console.log("Verified forward-compatible journal schema (021).");
} finally {
  await client.end();
}
