import type { PoolClient } from "pg";
import { ledgerSchemas, ledgerTable, childTable, type Field } from "./ledger-schema";

type Connection = Pick<PoolClient, "query">;
type Row = Record<string, unknown>;
const get = (row: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value !== null && typeof value === "object" ? (value as Row)[key] : undefined,
      row,
    );
function decode(row: Row, fields: Field[]) {
  const result: Row = {};
  for (const field of fields) {
    let value = row[field.column];
    if (
      value == null &&
      field.optional &&
      !["sourceOpenBalance", "sourceBalanceDate"].includes(field.path)
    )
      continue;
    if (value != null && ["numeric", "integer"].includes(field.type)) value = Number(value);
    if (value instanceof Date) value = value.toISOString().slice(0, 10);
    const keys = field.path.split(".");
    let target = result;
    for (const key of keys.slice(0, -1)) target = (target[key] ??= {}) as Row;
    target[keys.at(-1)!] = value;
  }
  return result;
}
export async function readLedger(
  client: Connection,
  companyId: string,
  domain: string,
): Promise<Row[]> {
  const spec = ledgerSchemas[domain]!;
  const rows = await client.query(
    `SELECT * FROM ${ledgerTable(domain)} WHERE company_id=$1 ORDER BY position`,
    [companyId],
  );
  const result = rows.rows.map((row) => decode(row, spec.fields));
  for (const [collection, fields] of Object.entries(spec.children)) {
    const children = await client.query(
      `SELECT * FROM ${childTable(domain, collection)} WHERE company_id=$1 ORDER BY position`,
      [companyId],
    );
    const grouped = new Map<string, unknown[]>();
    for (const row of children.rows) {
      const values = grouped.get(row.parent_id) ?? [];
      const value = decode(row, fields);
      values.push(collection === "companyIds" ? value["value"] : value);
      grouped.set(row.parent_id, values);
    }
    for (const [index, row] of rows.rows.entries())
      result[index]![collection] = grouped.get(row.id) ?? [];
  }
  return result;
}
export async function replaceLedger(
  client: Connection,
  companyId: string,
  domain: string,
  rows: Row[],
) {
  const spec = ledgerSchemas[domain]!;
  // Explicit child deletion avoids cascading away records during unrelated ledger rewrites.
  for (const collection of Object.keys(spec.children))
    await client.query(`DELETE FROM ${childTable(domain, collection)} WHERE company_id=$1`, [
      companyId,
    ]);
  await client.query(`DELETE FROM ${ledgerTable(domain)} WHERE company_id=$1`, [companyId]);
  for (const [position, row] of rows.entries()) {
    const id = domain === "accounts" || domain === "currencies" ? row["code"] : row["id"];
    const fields = spec.fields.filter((f) => f.column !== "id");
    const values = [companyId, id, position, ...fields.map((f) => get(row, f.path) ?? null)];
    await client.query(
      `INSERT INTO ${ledgerTable(domain)}(company_id,id,position,${fields.map((f) => f.column).join(",")}) VALUES(${values.map((_, i) => "$" + (i + 1)).join(",")})`,
      values,
    );
    for (const [collection, fields] of Object.entries(spec.children)) {
      const items = row[collection] ?? [];
      if (!Array.isArray(items)) throw new Error(`Invalid collection: ${collection}`);
      for (const [index, item] of items.entries()) {
        const child = collection === "companyIds" ? { value: item } : item;
        const values = [companyId, id, index, ...fields.map((f) => get(child, f.path) ?? null)];
        await client.query(
          `INSERT INTO ${childTable(domain, collection)}(company_id,parent_id,position,${fields.map((f) => f.column).join(",")}) VALUES(${values.map((_, i) => "$" + (i + 1)).join(",")})`,
          values,
        );
      }
    }
  }
}
