import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { randomUUID } from "node:crypto";
import pg from "pg";

// Substitute only the HTTP session boundary; use real services and PostgreSQL.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("/src/lib/auth.server.ts"))
      return {
        format: "module",
        source: "export async function readSession(){return globalThis.testLedgerSession??null}",
        shortCircuit: true,
      };
    return next(url, context);
  },
});
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const admin = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const schema = "coa_test_" + randomUUID().replaceAll("-", "");
let pool;
try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("options", "-c search_path=" + schema);
  process.env.DATABASE_URL = url.href;
  pool = (await import("../src/lib/db.server.ts")).db();
  for (const migration of [
    "001_auth",
    "002_cash_flow",
    "003_access_audit",
    "004_companies",
    "017_company_columns",
    "011_cash_chart_links",
    "012_vendors",
    "013_customers",
    "012_vendors",
  ])
    await pool.query(
      readFileSync(new URL("../database/" + migration + ".sql", import.meta.url), "utf8"),
    );
  const profile = (await pool.query("SELECT id FROM access_profiles WHERE system_admin")).rows[0]
    .id;
  const user = (
    await pool.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES('COA Admin','coa@test.invalid',$1,$2) RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128), profile],
    )
  ).rows[0];
  globalThis.testLedgerSession = user;
  const companyData = ["COA company", "LLC", "FL"];
  const a = (
    await pool.query(
      "INSERT INTO companies(name,entity,state) VALUES($1,$2,$3) RETURNING id",
      companyData,
    )
  ).rows[0].id;
  const b = (
    await pool.query("INSERT INTO companies(name,entity,state) VALUES($1,$2,$3) RETURNING id", [
      "Other company",
      "LLC",
      "FL",
    ])
  ).rows[0].id;
  const service = await import("../src/lib/accounting.server.ts");
  let revision = 0;
  async function command(command, args) {
    const result = await service.execute({ companyId: a, revision, command, args });
    revision = result.revision;
    return result;
  }

  const { vendorSchema } = await import("../src/lib/vendor-model.ts");
  const attachments = await import("../src/lib/vendor-attachments.server.ts");
  assert(!vendorSchema.safeParse({ displayName: "   " }).success);
  assert(!vendorSchema.safeParse({ displayName: "Vendor", email: "invalid" }).success);
  const created = await command("addVendor", [{ displayName: " Minimal Vendor " }]);
  const id = created.result;
  assert.equal((await service.load(a)).state.vendors[0].displayName, "Minimal Vendor");
  assert.equal((await service.load(b)).state.vendors.length, 0);
  await assert.rejects(
    service.execute({
      companyId: b,
      revision: 0,
      command: "updateVendor",
      args: [id, { displayName: "Other" }],
    }),
    /não encontrado/,
  );
  await assert.rejects(
    command("updateVendor", [id, { displayName: "Vendor", defaultExpenseAccountCode: "missing" }]),
    /conta contábil/,
  );
  const full = vendorSchema.parse({
    displayName: "Complete",
    firstName: "Ana",
    middleName: "Maria",
    lastName: "Silva",
    title: "Dra.",
    suffix: "III",
    companyName: "ACME",
    printOnCheckAs: "ACME LLC",
    email: "test@example.com",
    phone: "+1 555",
    mobile: "+55 11",
    fax: "555",
    website: "https://example.com",
    streetAddress: "Main 123",
    city: "City",
    stateProvince: "SP",
    zipCode: "01000-000",
    country: "BR",
    accountNumber: "client-123",
    taxId: "12-3456789",
    track1099: true,
    bankName: "Bank",
    routingNumber: "001234567",
    bankAccountNumber: "000123456789",
    bankAccountType: "Checking",
    notes: "Internal notes",
  });
  await command("updateVendor", [id, full]);
  assert.deepEqual((await service.load(a)).state.vendors[0], { ...full, id });
  const fileId = await attachments.upload({
    companyId: a,
    vendorId: id,
    name: "contract.txt",
    content: Buffer.from("contract").toString("base64"),
  });
  assert.equal((await attachments.list({ companyId: a, vendorId: id }))[0].size, 8);
  assert.equal(
    (await attachments.download({ companyId: a, vendorId: id, id: fileId })).content,
    Buffer.from("contract").toString("base64"),
  );
  await assert.rejects(
    attachments.download({ companyId: b, vendorId: id, id: fileId }),
    /não encontrado/,
  );
  await assert.rejects(
    attachments.upload({
      companyId: a,
      vendorId: id,
      name: "large",
      content: Buffer.alloc(20 * 1024 * 1024 + 1).toString("base64"),
    }),
    /20 MB/,
  );
  // Saving accounting rewrites domain rows; deferred FK must preserve existing attachments.
  await command("updateVendor", [id, { ...full, notes: "Updated" }]);
  assert.equal((await attachments.list({ companyId: a, vendorId: id })).length, 1);
  await attachments.remove({ companyId: a, vendorId: id, id: fileId });
  assert.equal((await attachments.list({ companyId: a, vendorId: id })).length, 0);
  // An active user with the portal profile must not modify supplier records/files.
  const portal = (
    await pool.query(
      "SELECT id FROM access_profiles WHERE NOT system_admin AND NOT write_accounting LIMIT 1",
    )
  ).rows[0];
  if (portal) {
    await pool.query("UPDATE app_users SET profile_id=$1 WHERE id=$2", [portal.id, user.id]);
    await assert.rejects(command("addVendor", [{ displayName: "Denied" }]));
    await assert.rejects(
      attachments.upload({
        companyId: a,
        vendorId: id,
        name: "denied",
        content: Buffer.from("x").toString("base64"),
      }),
    );
  }
  console.log(
    "PASS: vendor validation, round trip, company isolation, attachment size/download/removal, deferred relationships and authorization.",
  );
} finally {
  await pool?.end();
  await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
  await admin.end();
}
