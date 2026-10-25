import { db } from "./db.server";
import { authorize } from "./admin.server";
import { companySchema, type Company } from "./company-model";
import type { z } from "zod";
import type { PoolClient } from "pg";

export async function authorizeCompany(companyId: string, permission?: "write_cash" | "write_accounting" | "close_periods", connection = db()) {
  const auth = await authorize(permission);
  const result = await connection.query(`SELECT c.* FROM companies c JOIN app_users u ON u.id=$2 JOIN access_profiles p ON p.id=u.profile_id
    WHERE c.id=$1 AND c.active AND (p.system_admin OR p.all_companies OR EXISTS (SELECT 1 FROM profile_companies pc WHERE pc.profile_id=p.id AND pc.company_id=c.id))`, [companyId, auth.user.id]);
  if (!result.rowCount) throw new Error("Empresa indisponível ou sem permissão de acesso.");
  return { ...auth, company: mapCompany(result.rows[0]) };
}
export function mapCompany(row: Record<string, any>): Company {
  return { ...row.data, id: row.id, active: row.active, baseCurrency: "USD", initials: row.data.name.split(/\s+/).slice(0,2).map((s: string) => s[0]).join("").toUpperCase(), costMethod: row.cost_method, isPeriodClosed: row.period_closed, activePeriod: row.active_period };
}
export async function listCompanies() {
  const auth = await authorize();
  const result = await db().query(`SELECT c.* FROM companies c JOIN app_users u ON u.id=$1 JOIN access_profiles p ON p.id=u.profile_id
    WHERE (c.active OR $2) AND (p.system_admin OR p.all_companies OR EXISTS (SELECT 1 FROM profile_companies pc WHERE pc.profile_id=p.id AND pc.company_id=c.id)) ORDER BY c.data->>'name'`, [auth.user.id, auth.permissions.manage_companies]);
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
    await setActor(client, user.id);
    let id = data.id;
    if (id) {
      const accessible = await client.query(`SELECT c.id FROM companies c JOIN app_users u ON u.id=$2 JOIN access_profiles p ON p.id=u.profile_id WHERE c.id=$1 AND (p.system_admin OR p.all_companies OR EXISTS (SELECT 1 FROM profile_companies pc WHERE pc.profile_id=p.id AND pc.company_id=c.id)) FOR UPDATE OF c`, [id,user.id]);
      if (!accessible.rowCount) throw new Error("Empresa sem permissão de acesso.");
      await client.query("UPDATE companies SET data=$2,active=$3,revision=revision+1 WHERE id=$1", [id, JSON.stringify(data), data.active]);
    } else {
      const r = await client.query("INSERT INTO companies(data,active) VALUES($1,$2) RETURNING id", [JSON.stringify(data),data.active]);
      id = r.rows[0].id;
      // A profile restricted to selected companies must retain access to a company it creates.
      await client.query("INSERT INTO profile_companies(profile_id,company_id) SELECT profile_id,$2 FROM app_users WHERE id=$1 ON CONFLICT DO NOTHING", [user.id,id]);
    }
    await client.query("COMMIT");
    return { id: id!, permissions };
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
