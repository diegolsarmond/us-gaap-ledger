import type { PoolClient } from "pg";
// Read adapter only: the new engine owns its records; legacy modules cannot rewrite them.
export async function postedJournalProjection(
  client: Pick<PoolClient, "query">,
  companyId: string,
) {
  const exists = await client.query("SELECT to_regclass('journal_entries') AS table_name");
  if (!exists.rows[0].table_name) return [];
  const result = await client.query(
    `SELECT 'JE:'||j.id AS id,j.accounting_date::text AS date,j.description AS memo,'Manual' AS "sourceType",j.source_id AS "sourceId",j.functional_currency AS currency,1 AS "fxRate",'Posted' AS status,u.name AS "createdBy",j.created_at::text AS "createdAt",(SELECT jsonb_agg(jsonb_build_object('id',l.journal_entry_id||':'||l.line_number,'accountCode',l.account_code,'debit',l.base_debit,'credit',l.base_credit,'memo',l.description,'projectId',l.project_id) ORDER BY l.line_number) FROM journal_entry_lines l WHERE l.journal_entry_id=j.id) AS lines FROM journal_entries j JOIN app_users u ON u.id=j.created_by WHERE j.company_id=$1 AND j.status='Posted' ORDER BY j.accounting_date,j.id`,
    [companyId],
  );
  return result.rows;
}
