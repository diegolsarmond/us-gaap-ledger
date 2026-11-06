import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import pg from "pg";

// Input is a read-only xlrd extraction: { Customer: [{sheet,rows}], Vendor: [...] }.
const [companyId, sourcePath, mode] = process.argv.slice(2);
assert(
  companyId && sourcePath,
  "Usage: node --env-file=.env scripts/import-contact-lists.mjs COMPANY_ID SOURCE_JSON [--commit]",
);
assert(!mode || mode === "--commit", "Only --commit is supported; default is rollback.");
assert(process.env.DATABASE_URL, "DATABASE_URL required");
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
const { customerSchema, validateCustomers } = await import("../src/lib/customer-model.ts");
const { vendorSchema } = await import("../src/lib/vendor-model.ts");
const { parameterSchemas } = await import("../src/lib/parameters-model.ts");
const { ledgerSchemas, ledgerTable, childTable } = await import("../src/lib/ledger-schema.ts");
const { readLedger } = await import("../src/lib/ledger-storage.server.ts");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const text = (v) => String(v ?? "").trim();
const currencies = {
  "United States Dollar": "USD",
  "Peso Mexicano": "MXN",
  "Mexican Peso": "MXN",
  "British Pound Sterling": "GBP",
};
const currencyNames = {
  USD: "United States Dollar",
  MXN: "Mexican Peso",
  GBP: "British Pound Sterling",
};
const balance = (v) => {
  assert(typeof v === "number" && Number.isFinite(v), "Invalid source open balance");
  return v;
};
const input = { customers: [], vendors: [] };
for (const [kind, sheets] of Object.entries(source)) {
  assert(["Customer", "Vendor"].includes(kind), "Unknown source kind");
  for (const sheet of sheets) {
    const headers = sheet.rows[0];
    const expected =
      kind === "Customer"
        ? [
            "Name",
            "Company name",
            "Street Address",
            "City",
            "State",
            "Country",
            "Zip",
            "Phone",
            "Email",
            "Customer type",
            "Attachments",
            "Open balance",
          ]
        : [
            "Vendor",
            "Company name",
            "Street Address",
            "City",
            "State",
            "Country",
            "Zip",
            "Phone",
            "Email",
            "1099 Tracking",
            "Currency",
            "Attachments",
            "Open Balance",
          ];
    assert.deepEqual(headers, expected, "Source headers changed; review mapping");
    for (const [index, row] of sheet.rows.slice(1).entries()) {
      if (row.every((v) => v === "" || v == null)) continue;
      const r = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
      assert(!text(r.Attachments), `Row ${index + 2}: attachments require separate processing`);
      const common = {
        displayName: text(r.Name ?? r.Vendor),
        companyName: text(r["Company name"]),
        phone: text(r.Phone),
        email: text(r.Email),
        sourceBalanceDate: null,
      };
      try {
        if (kind === "Customer") {
          const candidate = {
            ...common,
            customerType: text(r["Customer type"]),
            billingAddress: {
              street: text(r["Street Address"]),
              city: text(r.City),
              state: text(r.State),
              country: text(r.Country),
              zip: text(r.Zip),
            },
            sourceOpenBalance: balance(r["Open balance"]),
          };
          const ready = customerSchema.safeParse(candidate);
          input.customers.push(
            ready.success
              ? ready.data
              : customerSchema.parse({ ...candidate, registrationStatus: "Draft" }),
          );
        } else {
          const currency = currencies[text(r.Currency)];
          assert(currency, `Unmapped currency: ${r.Currency}`);
          assert(["", "True", "False"].includes(text(r["1099 Tracking"])), "Unmapped 1099 flag");
          input.vendors.push(
            vendorSchema.parse({
              ...common,
              companyName: common.companyName || common.displayName,
              streetAddress: text(r["Street Address"]),
              city: text(r.City),
              stateProvince: text(r.State),
              country: text(r.Country),
              zipCode: text(r.Zip),
              sourceCurrency: currency,
              track1099: text(r["1099 Tracking"]) === "True",
              sourceOpenBalance: balance(r["Open Balance"]),
            }),
          );
        }
      } catch (e) {
        throw new Error(`${kind}, ${sheet.sheet}, row ${index + 2}: ${e.message}`);
      }
    }
  }
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(803003)");
  const company = (
    await client.query("SELECT id,name FROM companies WHERE id=$1 AND active FOR UPDATE", [
      companyId,
    ])
  ).rows[0];
  assert(company, "Company not found or inactive");
  // Only append rows; preserve existing IDs, attachments, and dependent records.
  const positions = new Map();
  async function insert(domain, row) {
    const spec = ledgerSchemas[domain];
    if (!positions.has(domain))
      positions.set(
        domain,
        Number(
          (
            await client.query(
              `SELECT coalesce(max(position),-1)+1 AS next FROM ${ledgerTable(domain)} WHERE company_id=$1`,
              [companyId],
            )
          ).rows[0].next,
        ),
      );
    const fields = spec.fields.filter((f) => f.column !== "id");
    const get = (path) => path.split(".").reduce((v, key) => v?.[key], row) ?? null;
    const id = domain === "currencies" ? row.code : row.id;
    const values = [companyId, id, positions.get(domain), ...fields.map((f) => get(f.path))];
    await client.query(
      `INSERT INTO ${ledgerTable(domain)} (company_id,id,position,${fields.map((f) => f.column).join(",")}) VALUES (${values.map((_, i) => "$" + (i + 1)).join(",")})`,
      values,
    );
    positions.set(domain, positions.get(domain) + 1);
    if (domain === "currencies")
      await client.query(
        `INSERT INTO ${childTable(domain, "companyIds")} (company_id,parent_id,position,value) VALUES ($1,$2,0,$1)`,
        [companyId, id],
      );
  }
  const currencyRows = await readLedger(client, companyId, "currencies");
  const createdCurrencies = [];
  for (const code of new Set(["USD", ...input.vendors.map((r) => r.sourceCurrency)])) {
    const existing = currencyRows.find((r) => r.code === code);
    if (existing) {
      assert(
        existing.status === "Active" && existing.isBaseCurrency === (code === "USD"),
        "Existing currency settings conflict: " + code,
      );
      continue;
    }
    const row = {
      ...parameterSchemas.currencies.parse({
        code,
        name: currencyNames[code],
        isBaseCurrency: code === "USD",
        status: "Active",
        scope: "companies",
        companyIds: [companyId],
        sharedId: randomUUID(),
      }),
    };
    await insert("currencies", row);
    currencyRows.push(row);
    createdCurrencies.push(code);
  }
  const summary = {};
  for (const domain of ["customers", "vendors"]) {
    const existing = await readLedger(client, companyId, domain);
    const byName = new Map(existing.map((r) => [r.displayName.trim().toLowerCase(), r]));
    const sourceNames = new Set();
    let inserted = 0,
      skipped = 0;
    for (const data of input[domain]) {
      const key = data.displayName.toLowerCase();
      assert(!sourceNames.has(key), "Duplicate source name: " + data.displayName);
      sourceNames.add(key);
      const prior = byName.get(key);
      if (prior) {
        // A rerun is allowed only when all imported fields still match.
        for (const [field, value] of Object.entries(data)) {
          if (field === "attachments") continue;
          assert.deepEqual(
            prior[field] ?? null,
            value ?? null,
            `Existing ${domain} differs: ${data.displayName}, ${field}`,
          );
        }
        skipped++;
        continue;
      }
      const row = { ...data, id: `${domain === "customers" ? "cust" : "vendor"}-${randomUUID()}` };
      await insert(domain, row);
      byName.set(key, row);
      inserted++;
    }
    const saved = await readLedger(client, companyId, domain);
    assert.equal(saved.length, existing.length + inserted);
    if (domain === "customers")
      validateCustomers(
        saved,
        currencyRows.map((r) => r.code),
        [],
        [],
      );
    let cents = 0;
    const balances = {};
    for (const row of input[domain]) {
      const record = saved.find((r) => r.displayName === row.displayName);
      assert(record, "Imported contact missing");
      const schema = domain === "customers" ? customerSchema : vendorSchema;
      assert.deepEqual(schema.parse(record), row, "Persisted contact differs from source mapping");
      const amount = Math.round(row.sourceOpenBalance * 100);
      cents += amount;
      const code = row.sourceCurrency || "Unspecified";
      balances[code] = (balances[code] ?? 0) + amount;
    }
    summary[domain] = {
      source: input[domain].length,
      inserted,
      skipped,
      drafts:
        domain === "customers"
          ? input.customers.filter((c) => c.registrationStatus === "Draft").length
          : 0,
      balanceCentsByCurrency: balances,
    };
  }
  if (createdCurrencies.length || Object.values(summary).some((s) => s.inserted)) {
    await insert("auditLogs", {
      id: `log-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      actor: "Codex",
      role: "Authorized data import",
      action: "IMPORT_CONTACT_LISTS",
      targetType: "Company",
      targetId: companyId,
      details: JSON.stringify({ source: "Customer/Vendor List XLS", summary, createdCurrencies }),
    });
    await client.query("UPDATE companies SET revision=revision+1 WHERE id=$1", [companyId]);
  }
  await client.query(mode === "--commit" ? "COMMIT" : "ROLLBACK");
  console.log(
    JSON.stringify(
      { company, committed: mode === "--commit", summary, createdCurrencies },
      null,
      2,
    ),
  );
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
