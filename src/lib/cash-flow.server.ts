import { db } from "./db.server";
import { authorizeCompany } from "./companies.server";
import type { PoolClient } from "pg";
import { summarize } from "./cash-flow-model";
import type {
  CashAccount,
  CashTransaction,
  CashData,
  CashReconciliation,
  GlCashCheck,
} from "./cash-flow-model";

/**
 * Cash records dated in a closed fiscal period are frozen. Locked periods must be reopened
 * in Fiscal Periods (close_periods permission); soft-closed periods accept changes only from
 * users holding that permission.
 */
async function assertOpenPeriods(
  client: Pick<PoolClient, "query">,
  companyId: string,
  dates: (string | null | undefined)[],
  canClosePeriods: boolean,
) {
  const list = [...new Set(dates.filter((d): d is string => !!d))];
  if (!list.length) return;
  const closed = await client.query(
    `SELECT data->>'periodCode' AS code, data->>'status' AS status FROM ledger_fiscalperiods
    WHERE company_id=$1 AND data->>'status' IN ('Locked','Soft-Close')
    AND EXISTS (SELECT 1 FROM unnest($2::date[]) d WHERE d BETWEEN (data->>'startDate')::date AND (data->>'endDate')::date)
    ORDER BY data->>'startDate'`,
    [companyId, list],
  );
  for (const period of closed.rows) {
    if (period.status === "Locked")
      throw new Error(
        `Fiscal period ${period.code} is locked. Reopen it in Fiscal Periods before changing cash records dated in it.`,
      );
    if (!canClosePeriods)
      throw new Error(
        `Fiscal period ${period.code} is soft-closed. Only users allowed to close periods can change cash records dated in it.`,
      );
  }
}
/** Only realized cash has an accounting date; plans and cancellations do not. */
const accountingDate = (t: { status: string; paid_date: string | null }) =>
  t.status === "paid" ? t.paid_date : null;

export async function load(companyId: string): Promise<CashData> {
  await authorizeCompany(companyId);
  const id = companyId;
  const [accounts, transactions, categories, glAccounts] = await Promise.all([
    db().query(
      "SELECT id, name, currency, opening_date::text, opening_balance::float8, gl_account_code FROM cash_accounts WHERE company_id=$1 ORDER BY name",
      [id],
    ),
    db().query(
      "SELECT id, account_id, description, category, direction, amount::float8, due_date::text, paid_date::text, status, cash_flow_line, variance_note, forecast_amount::float8, forecast_date::text, forecast_direction, gl_account_code, transfer_id, transfer_account_id FROM cash_transactions WHERE company_id=$1 ORDER BY due_date DESC, created_at DESC",
      [id],
    ),
    db().query(
      "SELECT id,name,company_id FROM cash_categories WHERE company_id IS NULL OR company_id=$1 ORDER BY name",
      [id],
    ),
    db().query(
      "SELECT id AS code,data->>'name' AS name,data->>'type' AS type,data->>'balanceType' AS \"balanceType\" FROM ledger_accounts WHERE company_id=$1 ORDER BY id",
      [id],
    ),
  ]);
  return {
    accounts: accounts.rows,
    transactions: transactions.rows,
    categories: categories.rows,
    glAccounts: glAccounts.rows,
  };
}

type ReconciliationScope = Pick<
  CashReconciliation,
  "companyId" | "start" | "end" | "currency" | "accountId"
>;
export async function readReconciliation(
  data: ReconciliationScope,
): Promise<CashReconciliation | null> {
  await authorizeCompany(data.companyId);
  const result = await db().query(
    "SELECT inputs FROM cash_flow_reconciliations WHERE company_id=$1 AND period_start=$2 AND period_end=$3 AND currency=$4 AND account_id IS NOT DISTINCT FROM $5::uuid",
    [data.companyId, data.start, data.end, data.currency, data.accountId],
  );
  return result.rows[0]?.inputs ?? null;
}
/**
 * Compares actual ending cash with the posted GL balance of the linked cash accounts.
 * Proof is only possible when the scope owns its GL accounts exclusively and is in USD,
 * the currency journal amounts are recorded in.
 */
export async function checkGlCash(data: ReconciliationScope): Promise<GlCashCheck> {
  const client = await db().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await authorizeCompany(data.companyId, undefined, client);
    const unavailable = (reason: string): GlCashCheck => ({
      status: "unavailable",
      reason,
      glBalance: null,
      cashBalance: null,
      difference: null,
      glAccounts: [],
    });
    if (data.currency !== "USD")
      return unavailable(
        "General ledger amounts are recorded in USD. Foreign-currency cash needs FX remeasurement before it can be proven against the GL.",
      );
    const all = await client.query(
      "SELECT id, name, currency, opening_date::text, opening_balance::float8, gl_account_code FROM cash_accounts WHERE company_id=$1",
      [data.companyId],
    );
    const accounts: CashAccount[] = all.rows.filter(
      (a) => a.currency === data.currency && (!data.accountId || a.id === data.accountId),
    );
    if (!accounts.length) return unavailable("No cash accounts in this scope.");
    if (accounts.some((a) => !a.gl_account_code))
      return unavailable("Every cash account in scope must be linked to a GL account.");
    const codes = [...new Set(accounts.map((a) => a.gl_account_code!))];
    const ids = new Set(accounts.map((a) => a.id));
    if (all.rows.some((a) => !ids.has(a.id) && codes.includes(a.gl_account_code)))
      return unavailable(
        "A linked GL account is shared with cash accounts outside this scope. Select all accounts that share it.",
      );
    const transactions = await client.query(
      "SELECT id, account_id, direction, amount::float8, due_date::text, paid_date::text, status, transfer_account_id FROM cash_transactions WHERE company_id=$1 AND account_id = ANY($2::uuid[])",
      [data.companyId, [...ids]],
    );
    const gl = await client.query(
      `SELECT coalesce(sum((l->>'debit')::numeric - (l->>'credit')::numeric),0)::float8 AS balance
      FROM ledger_journals j CROSS JOIN LATERAL jsonb_array_elements(j.data->'lines') l
      WHERE j.company_id=$1 AND j.data->>'date' <= $2 AND l->>'accountCode' = ANY($3::text[])`,
      [data.companyId, data.end, codes],
    );
    const report = summarize(accounts, transactions.rows, data.end, data.end, "daily", false);
    const cashBalance = report.periods.at(-1)?.balance ?? report.opening;
    const glBalance = Math.round(gl.rows[0].balance * 100) / 100;
    const difference = (Math.round(cashBalance * 100) - Math.round(glBalance * 100)) / 100;
    return {
      status: difference === 0 ? "verified" : "difference",
      reason:
        difference === 0
          ? "Actual ending cash agrees with posted GL balances."
          : "Actual ending cash differs from posted GL balances. Cash movements recorded here do not post journal entries; review AR/AP settlements and bank postings.",
      glBalance,
      cashBalance,
      difference,
      glAccounts: codes,
    };
  } finally {
    // Read-only snapshot: always end it, including on the early "unavailable" returns.
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}
export async function writeReconciliation(data: CashReconciliation) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(data.companyId, "write_cash", client);
    await client.query("SELECT set_config('app.actor_id',$1,true)", [auth.user.id]);
    await assertOpenPeriods(client, data.companyId, [data.end], auth.permissions.close_periods);
    if (data.accountId) {
      const account = await client.query(
        "SELECT 1 FROM cash_accounts WHERE id=$1 AND company_id=$2 AND currency=$3",
        [data.accountId, data.companyId, data.currency],
      );
      if (!account.rowCount) throw new Error("Select an account in this company and currency.");
    }
    await client.query(
      `INSERT INTO cash_flow_reconciliations(company_id,period_start,period_end,currency,account_id,inputs,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(company_id,period_start,period_end,currency,account_id)
      DO UPDATE SET inputs=EXCLUDED.inputs,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [
        data.companyId,
        data.start,
        data.end,
        data.currency,
        data.accountId,
        JSON.stringify(data),
        auth.user.id,
      ],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function saveAccount(
  data: Omit<CashAccount, "id"> & { id?: string | undefined; companyId: string },
) {
  const auth = await authorizeCompany(data.companyId, "write_cash");
  const id = data.companyId;
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    await authorizeCompany(id, "write_cash", client);
    await client.query("SELECT set_config('app.actor_id',$1,true)", [auth.user.id]);
    if (!data.id && !data.gl_account_code)
      throw new Error("Link this cash account to an Asset account in Chart of Accounts.");
    if (data.gl_account_code) {
      const gl = await client.query(
        "SELECT 1 FROM ledger_accounts WHERE company_id=$1 AND id=$2 AND data->>'type'='Asset'",
        [id, data.gl_account_code],
      );
      if (!gl.rowCount)
        throw new Error("Select an Asset account from this company's Chart of Accounts.");
    }
    if (data.id) {
      const account = await client.query(
        "SELECT currency,gl_account_code,opening_date::text,opening_balance::float8 FROM cash_accounts WHERE id=$1 AND company_id=$2 FOR UPDATE",
        [data.id, id],
      );
      if (!account.rowCount) throw new Error("Account not found.");
      const previous = account.rows[0];
      if (
        previous.opening_date !== data.opening_date ||
        Math.round(previous.opening_balance * 100) !== Math.round(data.opening_balance * 100)
      )
        await assertOpenPeriods(
          client,
          id,
          [previous.opening_date, data.opening_date],
          auth.permissions.close_periods,
        );
      const movements = await client.query(
        "SELECT count(*)::int AS count, min(least(due_date, paid_date, forecast_date))::text AS first_date FROM cash_transactions WHERE account_id=$1 AND company_id=$2",
        [data.id, id],
      );
      const history = movements.rows[0];
      if (
        history.count > 0 &&
        account.rows[0].gl_account_code &&
        account.rows[0].gl_account_code !== data.gl_account_code
      )
        throw new Error("The linked GL account cannot change after cash movements are recorded.");
      if (history.count > 0 && data.currency !== account.rows[0].currency)
        throw new Error("The currency cannot be changed for an account with transactions.");
      if (history.first_date && data.opening_date > history.first_date)
        throw new Error("The opening date cannot be later than existing transactions.");
      await client.query(
        "UPDATE cash_accounts SET name=$3,currency=$4,opening_date=$5,opening_balance=$6,gl_account_code=$7 WHERE id=$1 AND company_id=$2",
        [
          data.id,
          id,
          data.name,
          data.currency,
          data.opening_date,
          data.opening_balance,
          data.gl_account_code,
        ],
      );
    } else {
      await assertOpenPeriods(client, id, [data.opening_date], auth.permissions.close_periods);
      await client.query(
        "INSERT INTO cash_accounts(company_id,name,currency,opening_date,opening_balance,user_id,gl_account_code) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          data.name,
          data.currency,
          data.opening_date,
          data.opening_balance,
          auth.user.id,
          data.gl_account_code,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505")
      throw new Error("An account with this name already exists.");
    throw error;
  } finally {
    client.release();
  }
  return { ok: true };
}
export async function saveTransaction(
  data: Omit<CashTransaction, "id"> & { id?: string | undefined; companyId: string },
) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(data.companyId, "write_cash", client);
    await client.query("SELECT set_config('app.actor_id',$1,true)", [auth.user.id]);
    const selectAccount =
      "SELECT opening_date::text, currency, gl_account_code FROM cash_accounts WHERE id=$1 AND company_id=$2 FOR UPDATE";
    const account = await client.query(selectAccount, [data.account_id, data.companyId]);
    if (!account.rowCount) throw new Error("The account does not belong to this company.");
    const previous = data.id
      ? (
          await client.query(
            "SELECT account_id, status, paid_date::text, transfer_id, transfer_account_id FROM cash_transactions WHERE id=$1 AND company_id=$2 FOR UPDATE",
            [data.id, data.companyId],
          )
        ).rows[0]
      : null;
    if (data.id && !previous) throw new Error("Transaction not found.");
    const transfer = data.cash_flow_line === "internal_transfer";
    if (previous && !!previous.transfer_id !== transfer)
      throw new Error(
        "A transfer cannot be reclassified, and a transaction cannot become a transfer. Cancel it and create a new entry.",
      );
    if (
      previous?.transfer_id &&
      (previous.account_id !== data.account_id ||
        previous.transfer_account_id !== data.transfer_account_id)
    )
      throw new Error(
        "The accounts of a transfer cannot change. Cancel it and create a new transfer.",
      );
    let counterpart: { opening_date: string; currency: string; gl_account_code: string } | null =
      null;
    if (transfer) {
      counterpart = (await client.query(selectAccount, [data.transfer_account_id, data.companyId]))
        .rows[0];
      if (!counterpart)
        throw new Error("The counterpart cash account does not belong to this company.");
      if (counterpart.currency !== account.rows[0].currency)
        throw new Error(
          "Transfers between currencies need FX handling and are not supported yet. Record them as separate classified movements.",
        );
      if (!account.rows[0].gl_account_code || !counterpart.gl_account_code)
        throw new Error(
          "Link both cash accounts to Chart of Accounts before recording a transfer.",
        );
      if (
        data.due_date < counterpart.opening_date ||
        (data.paid_date && data.paid_date < counterpart.opening_date)
      )
        throw new Error("Dates must be on or after both accounts' opening dates.");
      // Each leg's counterpart is the other cash account's GL account.
      data.gl_account_code = counterpart.gl_account_code;
    }
    await assertOpenPeriods(
      client,
      data.companyId,
      [previous && accountingDate(previous), accountingDate(data)],
      auth.permissions.close_periods,
    );
    if (!data.id && !data.gl_account_code)
      throw new Error(
        "Select a counterpart account from Chart of Accounts for this transaction or forecast.",
      );
    if (data.gl_account_code) {
      const gl = await client.query("SELECT 1 FROM ledger_accounts WHERE company_id=$1 AND id=$2", [
        data.companyId,
        data.gl_account_code,
      ]);
      if (!gl.rowCount)
        throw new Error("The counterpart GL account does not belong to this company.");
    }
    if (
      data.due_date < account.rows[0].opening_date ||
      (data.paid_date && data.paid_date < account.rows[0].opening_date)
    )
      throw new Error("Dates must be on or after the account opening date.");
    const category = await client.query(
      "SELECT 1 FROM cash_categories WHERE name=$1 AND (company_id IS NULL OR company_id=$2)",
      [data.category, data.companyId],
    );
    if (!category.rowCount) throw new Error("Select a category available for this company.");
    const values = [
      data.companyId,
      data.account_id,
      data.description,
      data.category,
      data.direction,
      data.amount,
      data.due_date,
      data.paid_date,
      data.status,
      data.cash_flow_line,
      data.variance_note,
      data.gl_account_code,
    ];
    // The mirror leg moves the same amount the other way on the same dates.
    const mirror = transfer
      ? [
          data.companyId,
          data.transfer_account_id,
          data.description,
          data.category,
          data.direction === "in" ? "out" : "in",
          data.amount,
          data.due_date,
          data.paid_date,
          data.status,
          data.cash_flow_line,
          data.variance_note,
          account.rows[0].gl_account_code,
        ]
      : null;
    const update =
      "UPDATE cash_transactions SET account_id=$2,description=$3,category=$4,direction=$5,amount=$6,due_date=$7,paid_date=$8,status=$9,cash_flow_line=$10,variance_note=$11,gl_account_code=$12";
    const insert =
      "INSERT INTO cash_transactions(company_id,account_id,description,category,direction,amount,due_date,paid_date,status,cash_flow_line,variance_note,gl_account_code,user_id,transfer_id,transfer_account_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)";
    if (data.id) {
      const r = await client.query(update + " WHERE company_id=$1 AND id=$13", [
        ...values,
        data.id,
      ]);
      if (!r.rowCount) throw new Error("Transaction not found.");
      if (mirror) {
        const other = await client.query(
          update + " WHERE company_id=$1 AND transfer_id=$13 AND id<>$14",
          [...mirror, previous.transfer_id, data.id],
        );
        if (other.rowCount !== 1) throw new Error("The other leg of this transfer is missing.");
      }
    } else {
      const transferId = mirror ? crypto.randomUUID() : null;
      await client.query(insert, [...values, auth.user.id, transferId, data.transfer_account_id]);
      if (mirror)
        await client.query(insert, [...mirror, auth.user.id, transferId, data.account_id]);
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
export async function removeTransaction(transactionId: string, companyId: string) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(companyId, "write_cash", client);
    await client.query("SELECT set_config('app.actor_id',$1,true)", [auth.user.id]);
    // A transfer is deleted as a pair, so both legs are checked.
    const legs = await client.query(
      `SELECT id, status, paid_date::text, forecast_amount FROM cash_transactions t WHERE company_id=$2
      AND (id=$1 OR transfer_id=(SELECT transfer_id FROM cash_transactions WHERE id=$1 AND company_id=$2)) FOR UPDATE`,
      [transactionId, companyId],
    );
    if (!legs.rowCount) throw new Error("Transaction not found.");
    if (legs.rows.some((t) => t.forecast_amount !== null))
      throw new Error(
        "Cancel forecasted transactions instead of deleting them to preserve variance history.",
      );
    await assertOpenPeriods(
      client,
      companyId,
      legs.rows.map(accountingDate),
      auth.permissions.close_periods,
    );
    await client.query(
      "DELETE FROM cash_transactions WHERE company_id=$1 AND id = ANY($2::uuid[])",
      [companyId, legs.rows.map((t) => t.id)],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function writeCategory(data: {
  id?: string | undefined;
  companyId: string;
  name?: string;
  company_id?: string | null;
}) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(data.companyId, "write_cash", client);
    await client.query("SELECT set_config('app.actor_id',$1,true)", [auth.user.id]);
    const old = data.id
      ? (await client.query("SELECT * FROM cash_categories WHERE id=$1 FOR UPDATE", [data.id]))
          .rows[0]
      : null;
    if (data.id && !old) throw new Error("Category not found.");
    const scopes = [old?.company_id, data.name === undefined ? undefined : data.company_id].filter(
      (v) => v !== undefined,
    );
    if (scopes.includes(null)) {
      const companies = await client.query("SELECT id FROM companies WHERE active");
      for (const c of companies.rows) await authorizeCompany(c.id, "write_cash", client);
    }
    for (const id of scopes) if (id) await authorizeCompany(id, "write_cash", client);
    if (old) {
      const used = await client.query(
        "SELECT 1 FROM cash_transactions WHERE category=$1 AND ($2::uuid IS NULL OR company_id=$2) LIMIT 1",
        [old.name, old.company_id],
      );
      if (
        used.rowCount &&
        (data.name === undefined || data.company_id !== old.company_id || data.name !== old.name)
      )
        throw new Error(
          "A category used in transactions cannot be deleted or changed. Create a new category.",
        );
    }
    if (data.name === undefined)
      await client.query("DELETE FROM cash_categories WHERE id=$1", [data.id]);
    else if (data.id)
      await client.query("UPDATE cash_categories SET name=$2,company_id=$3 WHERE id=$1", [
        data.id,
        data.name,
        data.company_id,
      ]);
    else
      await client.query("INSERT INTO cash_categories(name,company_id) VALUES($1,$2)", [
        data.name,
        data.company_id,
      ]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new Error("A category with this name already exists in this scope.");
    throw e;
  } finally {
    client.release();
  }
}
