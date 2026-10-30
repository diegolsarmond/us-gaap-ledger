import { authorizeCompany, setActor } from "./companies.server";
import { load, readState, validateState } from "./accounting.server";
import { parameterSchemas, type mutationSchema } from "./parameters-model";
import { db } from "./db.server";
import type { z } from "zod";
import { readLedger, replaceLedger } from "./ledger-storage.server";
export async function listParameterCompanies() {
  return (await (await import("./companies.server")).listCompanies()).companies.filter(
    (c) => c.active,
  );
}
export async function readParameters(companyId: string) {
  const auth = await authorizeCompany(companyId);
  const data = await load(companyId);
  return {
    ...data.state,
    revision: data.revision,
    userPersona: {
      name: auth.user.name,
      canClosePeriod: auth.permissions.close_periods,
      canManageUsers: auth.permissions.manage_users,
    },
    canWrite: auth.permissions.write_accounting,
  };
}
export async function writeParameter(input: z.infer<typeof mutationSchema>) {
  const value =
    input.operation === "delete" ? undefined : parameterSchemas[input.domain].parse(input.value);
  const permission = input.domain === "fiscalPeriods" ? "close_periods" : "write_accounting";
  const client = await db().connect();
  const table = `ledger_${input.domain.toLowerCase()}`;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(input.companyId, permission, client);
    await setActor(client, auth.user.id);
    const revision = await client.query("SELECT revision FROM companies WHERE id=$1 FOR UPDATE", [
      input.companyId,
    ]);
    if (revision.rows[0].revision !== input.revision)
      throw new Error("The data was changed in another session. Refresh the page and try again.");
    const source = await readLedger(client, input.companyId, input.domain);
    const old = source.find(
      (row) => (input.domain === "currencies" ? row["code"] : row["id"]) === input.id,
    );
    if (input.operation !== "create" && !old)
      throw new Error("Parameter not found. Refresh the page.");
    const sharedId = old?.["sharedId"] ?? crypto.randomUUID();
    const scope =
      input.domain === "currencies" ? "companies" : (value?.scope ?? old?.["scope"] ?? "companies");
    const all = await client.query("SELECT id FROM companies WHERE active ORDER BY id");
    const targets: string[] =
      input.operation === "delete"
        ? []
        : input.domain === "currencies"
          ? [input.companyId]
          : scope === "global"
            ? all.rows.map((r) => r["id"])
            : [
                ...new Set(
                  value?.companyIds ??
                    ((old?.["companyIds"] as string[] | undefined)?.length
                      ? (old?.["companyIds"] as string[])
                      : [input.companyId]),
                ),
              ];
    if (input.operation !== "delete" && !targets.length)
      throw new Error("Select at least one company.");
    const linked =
      input.domain !== "currencies" && old?.["sharedId"]
        ? await client.query(`SELECT company_id FROM ${table} WHERE shared_id=$1`, [sharedId])
        : { rows: old ? [{ company_id: input.companyId }] : [] };
    const affected = [...new Set([...targets, ...linked.rows.map((r) => r.company_id)])].sort();
    for (const companyId of affected) {
      await authorizeCompany(companyId, permission, client);
      await client.query("SELECT revision FROM companies WHERE id=$1 FOR UPDATE", [companyId]);
    }
    for (const companyId of affected) {
      const state = await readState(companyId, client);
      const rows = state[input.domain] as unknown as Record<string, unknown>[];
      const existing = rows.find(
        (r) =>
          r["sharedId"] === sharedId ||
          (companyId === input.companyId &&
            (input.domain === "currencies" ? r["code"] : r["id"]) === input.id),
      );
      const remaining = rows.filter((r) => r !== existing);
      if (targets.includes(companyId) && value) {
        const next: Record<string, unknown> = {
          ...value,
          sharedId,
          scope,
          companyIds: scope === "global" ? [] : targets,
        };
        next["id"] =
          existing?.["id"] ?? (companyId === input.companyId ? input.id : crypto.randomUUID());
        if (input.domain === "fiscalPeriods") {
          next["closedBy"] = next["status"] === "Open" ? undefined : auth.user.name;
          next["closingDate"] =
            next["status"] === "Open" ? undefined : new Date().toISOString().slice(0, 10);
        }
        remaining.push(next);
      }
      (state[input.domain] as unknown[]) = remaining;
      const refs = validateState(state);
      await client.query("DELETE FROM ledger_references WHERE company_id=$1", [companyId]);
      for (const r of refs)
        await client.query(
          "INSERT INTO ledger_references(company_id,source_domain,source_id,account_id,project_id,statement_id) VALUES($1,$2,$3,$4,$5,$6)",
          [companyId, r.source_domain, r.source_id, r.account_id, r.project_id, r.statement_id],
        );
      await replaceLedger(client, companyId, input.domain, remaining);
      await client.query("UPDATE companies SET revision=revision+1 WHERE id=$1", [companyId]);
      await client.query(
        "INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,company_id) VALUES($1,$2,$3,$4,$5,$6)",
        [auth.user.id, auth.user.name, input.operation, input.domain, input.id, companyId],
      );
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
