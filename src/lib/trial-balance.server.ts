import { db } from "./db.server";
import { authorizeCompany, setActor } from "./companies.server";
import { readLedger } from "./ledger-storage.server";
import {
  trialFilters,
  exactSum,
  type TrialReport,
  type TrialRow,
  type TrialActivity,
} from "./trial-balance";
// Legacy journals already store functional amounts (the old engine converts before persisting).
// Reversed legacy originals remain part of history alongside their posted counter-entry.
export const trialSource = `WITH movements AS (
 SELECT l.account_code,j.id::text AS id,j.journal_number AS number,j.accounting_date AS date,
 j.description,l.description AS line_description,j.reference,j.source_module AS source,l.line_number AS sequence,
 l.cost_center_id,l.base_debit AS debit,l.base_credit AS credit,j.transaction_currency AS currency,l.debit AS original_debit,l.credit AS original_credit
 FROM journal_entries j JOIN journal_entry_lines l ON l.journal_entry_id=j.id AND l.tenant_id=j.tenant_id AND l.company_id=j.company_id
 WHERE j.tenant_id=(SELECT id FROM accounting_tenant WHERE singleton) AND j.company_id=$1 AND j.status='Posted' AND j.accounting_date<=$3::date
 UNION ALL
 SELECT l.account_code,'legacy:'||j.id,j.id,j.date,j.memo,l.memo,'',j.source_type,l.position,l.cost_center_id,l.debit,l.credit,'USD',l.debit,l.credit
 FROM ledger_journals j JOIN ledger_journals_lines l ON l.company_id=j.company_id AND l.parent_id=j.id
 WHERE j.company_id=$1 AND j.status IN ('Posted','Reversed') AND j.date<=$3::date
), aggregated AS (
 SELECT account_code,coalesce(sum(debit-credit) FILTER(WHERE date<$2::date),0) AS opening,
 coalesce(sum(debit) FILTER(WHERE date>=$2::date),0) AS period_debit,coalesce(sum(credit) FILTER(WHERE date>=$2::date),0) AS period_credit
 FROM movements WHERE ($4::text='' OR coalesce(cost_center_id,'Unassigned')=$4) GROUP BY account_code
), balances AS (
 SELECT account_code,opening,period_debit,period_credit,opening+period_debit-period_credit AS closing FROM aggregated
)`;
export async function generateTrialBalance(raw: unknown): Promise<TrialReport> {
  const f = trialFilters.parse(raw);
  const c = await db().connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const auth = await authorizeCompany(f.companyId, undefined, c);
    await setActor(c, auth.user.id);
    const params = [f.companyId, f.start, f.end, f.costCenter];
    const periods = await readLedger(c, f.companyId, "fiscalPeriods");
    const centers = await readLedger(c, f.companyId, "costCenters");
    if (
      f.costCenter &&
      f.costCenter !== "Unassigned" &&
      !centers.some((x) => x["id"] === f.costCenter)
    )
      throw new Error("Cost center unavailable");
    const summary = (
      await c.query(
        `${trialSource} SELECT coalesce(sum(greatest(closing,0)),0)::text AS total_debit,coalesce(sum(greatest(-closing,0)),0)::text AS total_credit,coalesce(sum(closing),0)::text AS difference FROM balances`,
        [f.companyId, f.start, f.end, ""],
      )
    ).rows[0];
    const rows = (
      await c.query(
        `${trialSource} SELECT a.id AS code,a.name,a.type,a.parent_account_code AS parent,
 greatest(coalesce(b.opening,0),0)::text AS opening_debit,greatest(-coalesce(b.opening,0),0)::text AS opening_credit,
 coalesce(b.period_debit,0)::text AS period_debit,coalesce(b.period_credit,0)::text AS period_credit,
 greatest(coalesce(b.closing,0),0)::text AS closing_debit,greatest(-coalesce(b.closing,0),0)::text AS closing_credit
 FROM ledger_accounts a LEFT JOIN balances b ON b.account_code=a.id WHERE a.company_id=$1
 AND NOT EXISTS(SELECT 1 FROM ledger_accounts child WHERE child.company_id=a.company_id AND child.parent_account_code=a.id)
 ORDER BY a.id`,
        params,
      )
    ).rows as TrialRow[];
    const tree = await readLedger(c, f.companyId, "accounts");
    const groups = tree
      .filter((a) => tree.some((child) => child["parentCode"] === a["code"]))
      .map((a) => {
        const descendants = new Set<string>([String(a["code"])]);
        for (let i = 0; i < tree.length; i++)
          for (const child of tree)
            if (descendants.has(String(child["parentCode"])))
              descendants.add(String(child["code"]));
        return {
          code: String(a["code"]),
          name: String(a["name"]),
          descendants: rows.filter((r) => descendants.has(r.code)).map((r) => r.code),
        };
      });
    const scoped = rows.filter(
      (r) =>
        (f.showZero ||
          [r.opening_debit, r.opening_credit, r.period_debit, r.period_credit].some((v) =>
            /[1-9]/.test(v),
          )) &&
        (!f.accountType || r.type === f.accountType) &&
        (!f.search || `${r.code} ${r.name}`.toLowerCase().includes(f.search.toLowerCase())),
    );
    const debit = exactSum(scoped.map((r) => r.closing_debit)),
      credit = exactSum(scoped.map((r) => r.closing_credit));
    const result: TrialReport = {
      company: auth.company.name,
      currency: auth.company.baseCurrency,
      generated: new Date().toISOString(),
      filters: f,
      periods: periods as unknown as TrialReport["periods"],
      centers: centers as unknown as TrialReport["centers"],
      accounts: scoped,
      groups,
      ...summary,
      status: !/[1-9]/.test(summary.difference) ? "Balanced" : "Out of Balance",
      subset_debit: debit,
      subset_credit: credit,
      subset_difference: exactSum([debit, `-${credit}`]),
    };
    if (f.account) {
      const accountRow = rows.find((r) => r.code === f.account);
      if (!accountRow) throw new Error("Account unavailable");
      result.account_row = accountRow;
      const activity = await c.query(
        `${trialSource}, activity AS (SELECT *, (SELECT coalesce(opening,0) FROM balances WHERE account_code=$5)+sum(debit-credit) OVER(ORDER BY date,id,sequence ROWS UNBOUNDED PRECEDING) AS running,count(*) OVER()::int AS count FROM movements WHERE account_code=$5 AND date>=$2::date AND ($4::text='' OR coalesce(cost_center_id,'Unassigned')=$4)) SELECT id,number,date::text,coalesce(nullif(line_description,''),description) AS description,reference,source,debit::text,credit::text,running::text,currency,original_debit::text,original_credit::text,count FROM activity ORDER BY date,id,sequence LIMIT 100 OFFSET $6`,
        [...params, f.account, f.page * 100],
      );
      result.activity = activity.rows as TrialActivity[];
      result.activity_count = activity.rows[0]?.count ?? 0;
    }
    await c.query(
      `INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,company_id,after_data) VALUES($1,$2,$3,'TrialBalance',$4::text,$4::uuid,$5::jsonb)`,
      [
        auth.user.id,
        auth.user.name,
        f.export ? `Export ${f.export.toUpperCase()}` : "Generate report",
        f.companyId,
        JSON.stringify({
          filters: f,
          status: result.status,
          difference: result.difference,
          generated: result.generated,
        }),
      ],
    );
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function trialHttp(request: Request) {
  try {
    const p = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await generateTrialBalance({ ...p, showZero: p["showZero"] === "true" }));
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unable to generate report";
    return Response.json(
      { error },
      {
        status: /Session expired/.test(error)
          ? 401
          : /access denied|permission|profile does not allow/i.test(error)
            ? 403
            : 400,
      },
    );
  }
}
