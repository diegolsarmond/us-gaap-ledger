import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import pg from "pg";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts") && url.includes("/src/"))
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
      };
    return next(url, context);
  },
});
const { vendorSchema } = await import("../src/lib/vendor-model.ts");
const { importColumns, parseImportRows } = await import("../src/lib/bulk-import.ts");
const { readLedger, replaceLedger } = await import("../src/lib/ledger-storage.server.ts");
const minimal = { displayName: "Vendor", companyName: "Vendor LLC" };
assert(!vendorSchema.safeParse({ displayName: "Vendor" }).success);
assert(!vendorSchema.safeParse({ ...minimal, companyName: "  " }).success);
for (const data of [
  { cc: "invalid" },
  { bcc: "good@example.com;invalid" },
  { bankAccountNumber: "1234", routingNumber: "123456789" },
  { bankAccountNumber: "123456789012345678", routingNumber: "123456789" },
  { bankAccountNumber: "12345", routingNumber: "12345678" },
  { bankAccountNumber: "12345" },
  { routingNumber: "123456789" },
  { costRate: -1 },
  { billingRate: Infinity },
  { sourceBalanceDate: "2026-02-30", sourceOpenBalance: 1 },
  { sourceBalanceDate: "2026-01-01" },
  { customFields: [{ name: "Tier", type: "Number", value: "abc" }] },
  {
    customFields: [
      { name: "Tier", type: "Text", value: "a" },
      { name: "tier", type: "Text", value: "b" },
    ],
  },
])
  assert(!vendorSchema.safeParse({ ...minimal, ...data }).success, JSON.stringify(data));
const full = vendorSchema.parse({
  ...minimal,
  title: "Ms.",
  firstName: "Ana",
  middleName: "Maria",
  lastName: "Silva",
  suffix: "III",
  email: "ana@example.com",
  cc: "team@example.com; finance@example.com",
  bcc: "archive@example.com",
  phone: "+55 51 98822025",
  mobile: "+1 914 5214574",
  fax: "5551234",
  otherContact: "Reception",
  printOnCheckAs: "Vendor LLC",
  website: "https://example.com",
  streetAddress: "123 Main",
  streetAddress2: "Suite 2",
  addressLines: [{ line: "Building B" }, { line: "Floor 3" }],
  city: "Tomball",
  stateProvince: "TX",
  country: "US",
  zipCode: "77375-1195",
  notes: "Internal notes",
  bankAccountNumber: "0000012345",
  routingNumber: "001234567",
  bankName: "Bank",
  bankAccountType: "Checking",
  taxId: "84-3003203",
  track1099: true,
  costRate: 0,
  billingRate: 125.75,
  sourceOpenBalance: -50.25,
  sourceBalanceDate: "2026-01-01",
  customFields: [
    { name: "Tier", type: "Text", value: "Preferred" },
    { name: "Discount", type: "Number", value: "0" },
    { name: "Renewal", type: "Date", value: "2027-01-01" },
    { name: "Approved", type: "Checkbox", value: "false" },
  ],
});
assert(
  vendorSchema.safeParse({ ...minimal, sourceOpenBalance: 100, sourceBalanceDate: null }).success,
);
assert(importColumns("vendors").some((c) => c.path === "companyName" && c.required));
assert(importColumns("vendors").some((c) => c.path === "costRate" && c.type === "number"));
assert.equal(
  parseImportRows("vendors", [{ ...minimal, costRate: "0", track1099: "true" }])[0].costRate,
  0,
);
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const schema = "vendor_registration_test_" + randomUUID().replaceAll("-", "");
let created = false;
try {
  assert(process.env.DATABASE_URL, "DATABASE_URL required");
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await client.query(`SET search_path TO "${schema}"`);
  for (const name of readdirSync(new URL("../database/", import.meta.url))
    .filter(
      (n) =>
        n.endsWith(".sql") &&
        !n.startsWith("000") &&
        !["021_seed_accounts.sql", "024_updated_coa_template.sql"].includes(n),
    )
    .sort())
    await client.query(readFileSync(new URL("../database/" + name, import.meta.url), "utf8"));
  // Migration is safe to rerun.
  await client.query(
    readFileSync(
      new URL("../database/027_vendor_registration_fields.sql", import.meta.url),
      "utf8",
    ),
  );
  const a = (
    await client.query(
      "INSERT INTO companies(name,entity,state) VALUES('Vendor tests','LLC','TX') RETURNING id",
    )
  ).rows[0].id;
  const b = (
    await client.query(
      "INSERT INTO companies(name,entity,state) VALUES('Other company','LLC','TX') RETURNING id",
    )
  ).rows[0].id;
  const record = { ...full, id: randomUUID() };
  await client.query("BEGIN");
  await replaceLedger(client, a, "vendors", [record]);
  await client.query("COMMIT");
  assert.deepEqual(vendorSchema.parse((await readLedger(client, a, "vendors"))[0]), full);
  assert.deepEqual(await readLedger(client, b, "vendors"), []);
  const fileId = (
    await client.query(
      "INSERT INTO vendor_attachments(company_id,vendor_id,name,content) VALUES($1,$2,'contract.txt',$3) RETURNING id",
      [a, record.id, Buffer.from("contract")],
    )
  ).rows[0].id;
  await client.query("BEGIN");
  await replaceLedger(client, a, "vendors", [
    { ...record, customFields: record.customFields.slice(0, 1), addressLines: [] },
  ]);
  await client.query("COMMIT");
  const updated = (await readLedger(client, a, "vendors"))[0];
  assert.equal(updated.customFields.length, 1);
  assert.deepEqual(updated.addressLines, []);
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM vendor_attachments WHERE company_id=$1 AND id=$2",
        [a, fileId],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    client.query(
      "INSERT INTO ledger_vendors_customfields(company_id,parent_id,position,name,type,value) VALUES($1,$2,0,'X','Text','Y')",
      [b, record.id],
    ),
  );
  console.log(
    "PASS: required names, email lists, ACH boundaries, nullable rates/balances, custom types, import columns, migration rerun, PostgreSQL round trip, child removal, attachment preservation and company isolation.",
  );
} finally {
  await client.query("ROLLBACK").catch(() => {});
  if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  await client.end();
}
