import fs from "node:fs";
import pg from "pg";
const companies = [
  {
    name: "Clear Choice Filter LLC",
    trade_name: "Clear Choice Filter",
    entity: "LLC",
    country: "US",
    primary_currency: "USD",
    ein: "843003203",
    tax_id: "84-3003203",
    address: "23007 Silver Linden Ct",
    city: "Tomball",
    state: "TX",
    zip: "77375-1195",
    phone: "+55-51-98822025",
    email: "carlos.pinto@clearchoicefilter.com",
    municipality: "",
  },
  {
    name: "Skippi Pet Treats Internacional LLC",
    trade_name: "Skippi Pet USA",
    entity: "LLC",
    country: "US",
    primary_currency: "USD",
    ein: "392679054",
    tax_id: "39-2679054",
    address: "23007 Silver Linden Ct",
    city: "Tomball",
    state: "TX",
    zip: "77375-1195",
    phone: "+55-51-98822025",
    email: "carlos.pinto@sippiusa.com",
    municipality: "",
  },
  {
    name: "Clear Choice Filter Mexico S. DE R.L. DE C.V.",
    trade_name: "Clear Choice Filter Mexico",
    entity: "S. DE R.L. DE C.V.",
    country: "MX",
    primary_currency: "MXN",
    ein: "",
    tax_id: "CCF250320458",
    address: "Anillo Vial Fray Junípero Serra 20012, Int. 2A, Col. El Salitre",
    city: "Santiago de Querétaro",
    state: "Querétaro",
    municipality: "Querétaro",
    zip: "76127",
    phone: "+55-51-98822025",
    email: "carlos.pinto@clearchoicefilter.com",
  },
  {
    name: "Benjamin Shelley Julie",
    trade_name: "Alan David NYC",
    entity: "Unspecified",
    country: "MX",
    primary_currency: "USD",
    ein: "",
    tax_id: "CCF250320458",
    address: "Anillo Vial Fray Junípero Serra 20012, Int. 2A, Col. El Salitre",
    city: "Santiago de Querétaro",
    state: "Querétaro",
    municipality: "Querétaro",
    zip: "76127",
    phone: "+1 914-521-4574",
    email: "carlos@alandavidnyc.com",
  },
];
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query(
    fs.readFileSync(
      new URL("../database/026_international_company_registration.sql", import.meta.url),
      "utf8",
    ),
  );
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(803003)");
  for (const c of companies) {
    const data = {
      ...c,
      address_state: c.state,
      accountant_name: "Carlos",
      accountant_email: c.email,
    };
    const existing = await client.query(
      "SELECT id FROM companies WHERE lower(trim(name))=lower(trim($1)) OR ($2<>'' AND ein=$2) FOR UPDATE",
      [c.name, c.ein],
    );
    if (existing.rowCount > 1) throw new Error("Ambiguous company: " + c.name);
    const columns = Object.keys(data),
      values = Object.values(data);
    if (existing.rowCount)
      await client.query(
        "UPDATE companies SET " +
          columns.map((k, i) => k + "=$" + (i + 1)).join(",") +
          ",revision=revision+1 WHERE id=$" +
          (values.length + 1),
        [...values, existing.rows[0].id],
      );
    else
      await client.query(
        "INSERT INTO companies (" +
          columns.join(",") +
          ") VALUES (" +
          values.map((_, i) => "$" + (i + 1)).join(",") +
          ")",
        values,
      );
  }
  const verified = await client.query(
    "SELECT name,trade_name,country,tax_id,primary_currency,accountant_name,accountant_email FROM companies WHERE name=ANY($1) ORDER BY name",
    [companies.map((c) => c.name)],
  );
  if (verified.rowCount !== 4) throw new Error("Expected four companies");
  await client.query(process.argv.includes("--dry-run") ? "ROLLBACK" : "COMMIT");
  console.table(verified.rows);
  console.log(
    process.argv.includes("--dry-run")
      ? "Registration rolled back (schema migration applied)."
      : "Four companies registered. Accounting/reporting remains USD.",
  );
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
