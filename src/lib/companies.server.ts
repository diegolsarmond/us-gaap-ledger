import { db } from "./db.server";
import { authorize } from "./admin.server";
import { companySchema, type Company } from "./company-model";
import type { z } from "zod";
import type { PoolClient } from "pg";
import { readLedger, replaceLedger } from "./ledger-storage.server";

export async function authorizeCompany(
  companyId: string,
  permission?: "write_cash" | "write_accounting" | "close_periods",
  connection: Pick<PoolClient, "query"> = db(),
) {
  const auth = await authorize(permission);
  const result = await connection.query(
    `SELECT c.* FROM companies c JOIN app_users u ON u.id=$2 JOIN access_profiles p ON p.id=u.profile_id
    WHERE c.id=$1 AND c.active AND (p.system_admin OR p.all_companies OR EXISTS (SELECT 1 FROM profile_companies pc WHERE pc.profile_id=p.id AND pc.company_id=c.id))`,
    [companyId, auth.user.id],
  );
  if (!result.rowCount) throw new Error("Company unavailable or access denied.");
  return { ...auth, company: mapCompany(result.rows[0]) };
}
type CompanyInput = z.infer<typeof companySchema>;
// Registration fields and their typed columns in companies (017_company_columns.sql).
const COLUMNS = [
  ["name", "name"],
  ["tradeName", "trade_name"],
  ["entity", "entity"],
  ["federalTaxClassification", "federal_tax_classification"],
  ["state", "state"],
  ["ein", "ein"],
  ["address", "address"],
  ["city", "city"],
  ["addressState", "address_state"],
  ["zip", "zip"],
  ["phone", "phone"],
  ["email", "email"],
  ["basis", "basis"],
  ["fiscalYearEndMonth", "fiscal_year_end_month"],
  ["active", "active"],
] as const satisfies readonly (readonly [Exclude<keyof CompanyInput, "id">, string])[];
const columnValues = (data: CompanyInput) => COLUMNS.map(([field]) => data[field]);
export function mapCompany(
  row: Record<(typeof COLUMNS)[number][1], unknown> & {
    id: string;
    name: string;
    cost_method: Company["costMethod"];
    period_closed: boolean;
    active_period: string;
  },
): Company {
  const fields = Object.fromEntries(COLUMNS.map(([field, column]) => [field, row[column]]));
  return {
    ...(fields as Omit<CompanyInput, "id">),
    id: row.id,
    baseCurrency: "USD",
    initials: row.name
      .split(/\s+/)
      .slice(0, 2)
      .map((s: string) => s[0])
      .join("")
      .toUpperCase(),
    costMethod: row["cost_method"],
    isPeriodClosed: row["period_closed"],
    activePeriod: row["active_period"],
  };
}
export async function listCompanies() {
  const auth = await authorize();
  const result = await db().query(
    `SELECT c.* FROM companies c JOIN app_users u ON u.id=$1 JOIN access_profiles p ON p.id=u.profile_id
    WHERE (c.active OR $2) AND (p.system_admin OR p.all_companies OR EXISTS (SELECT 1 FROM profile_companies pc WHERE pc.profile_id=p.id AND pc.company_id=c.id)) ORDER BY c.name`,
    [auth.user.id, auth.permissions.manage_companies],
  );
  return { companies: result.rows.map(mapCompany), permissions: auth.permissions, user: auth.user };
}
export async function setActor(client: PoolClient, userId: string) {
  await client.query("SELECT set_config('app.actor_id',$1,true)", [userId]);
}
export async function saveCompany(data: z.infer<typeof companySchema>) {
  const { user, permissions } = await authorize("manage_companies");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    await setActor(client, user.id);
    let id = data.id;
    if (id) {
      const accessible = await client.query(
        `SELECT c.id FROM companies c JOIN app_users u ON u.id=$2 JOIN access_profiles p ON p.id=u.profile_id WHERE c.id=$1 AND (p.system_admin OR p.all_companies OR EXISTS (SELECT 1 FROM profile_companies pc WHERE pc.profile_id=p.id AND pc.company_id=c.id)) FOR UPDATE OF c`,
        [id, user.id],
      );
      if (!accessible.rowCount) throw new Error("Company access denied.");
      await client.query(
        `UPDATE companies SET ${COLUMNS.map(([, c], i) => `${c}=$${i + 2}`).join(",")},revision=revision+1 WHERE id=$1`,
        [id, ...columnValues(data)],
      );
    } else {
      const r = await client.query(
        `INSERT INTO companies(${COLUMNS.map(([, c]) => c).join(",")})
        VALUES(${COLUMNS.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
        columnValues(data),
      );
      id = r.rows[0].id;
      // Newly created companies inherit parameters explicitly shared globally.
      for (const domain of [
        "currencies",
        "taxJurisdictions",
        "paymentTerms",
        "costCenters",
        "expenseCategories",
        "fiscalPeriods",
      ]) {
        const sources = await client.query(
          `SELECT DISTINCT ON (shared_id) company_id,id FROM ledger_${domain.toLowerCase()} WHERE scope='global' ORDER BY shared_id,company_id`,
        );
        const inherited = [];
        for (const source of sources.rows) {
          const records = await readLedger(client, source.company_id, domain);
          const record = records.find(
            (row) => (domain === "currencies" ? row["code"] : row["id"]) === source.id,
          );
          if (record) inherited.push(record);
        }
        await replaceLedger(client, id!, domain, inherited);
      }
      // A profile restricted to selected companies must retain access to a company it creates.
      await client.query(
        "INSERT INTO profile_companies(profile_id,company_id) SELECT profile_id,$2 FROM app_users WHERE id=$1 ON CONFLICT DO NOTHING",
        [user.id, id],
      );
    }
    await client.query("COMMIT");
    return { id: id!, permissions };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
