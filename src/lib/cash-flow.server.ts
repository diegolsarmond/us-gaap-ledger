import { db } from "./db.server";
import { authorizeCompany } from "./companies.server";
import type { CashAccount, CashTransaction, CashData, CashReconciliation } from "./cash-flow-model";
export async function load(companyId: string): Promise<CashData> {
  await authorizeCompany(companyId);
  const id = companyId;
  const [accounts, transactions, categories] = await Promise.all([
    db().query(
      "SELECT id, name, currency, opening_date::text, opening_balance::float8 FROM cash_accounts WHERE company_id=$1 ORDER BY name",
      [id],
    ),
    db().query(
      "SELECT id, account_id, description, category, direction, amount::float8, due_date::text, paid_date::text, status, cash_flow_line, variance_note, forecast_amount::float8, forecast_date::text, forecast_direction FROM cash_transactions WHERE company_id=$1 ORDER BY due_date DESC, created_at DESC",
      [id],
    ),
    db().query(
      "SELECT id,name,company_id FROM cash_categories WHERE company_id IS NULL OR company_id=$1 ORDER BY name",
      [id],
    ),
  ]);
  return { accounts: accounts.rows, transactions: transactions.rows, categories: categories.rows };
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
export async function writeReconciliation(data: CashReconciliation) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(data.companyId, "write_cash", client);
    await client.query("SELECT set_config('app.actor_id',$1,true)", [auth.user.id]);
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
    if (data.id) {
      const account = await client.query(
        "SELECT currency FROM cash_accounts WHERE id=$1 AND company_id=$2 FOR UPDATE",
        [data.id, id],
      );
      if (!account.rowCount) throw new Error("Account not found.");
      const movements = await client.query(
        "SELECT count(*)::int AS count, min(least(due_date, paid_date, forecast_date))::text AS first_date FROM cash_transactions WHERE account_id=$1 AND company_id=$2",
        [data.id, id],
      );
      const history = movements.rows[0];
      if (history.count > 0 && data.currency !== account.rows[0].currency)
        throw new Error("The currency cannot be changed for an account with transactions.");
      if (history.first_date && data.opening_date > history.first_date)
        throw new Error("The opening date cannot be later than existing transactions.");
      await client.query(
        "UPDATE cash_accounts SET name=$3,currency=$4,opening_date=$5,opening_balance=$6 WHERE id=$1 AND company_id=$2",
        [data.id, id, data.name, data.currency, data.opening_date, data.opening_balance],
      );
    } else
      await client.query(
        "INSERT INTO cash_accounts(company_id,name,currency,opening_date,opening_balance,user_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, data.name, data.currency, data.opening_date, data.opening_balance, auth.user.id],
      );
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
    const account = await client.query(
      "SELECT opening_date::text FROM cash_accounts WHERE id=$1 AND company_id=$2 FOR UPDATE",
      [data.account_id, data.companyId],
    );
    if (!account.rowCount) throw new Error("The account does not belong to this company.");
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
    ];
    if (data.id) {
      const r = await client.query(
        "UPDATE cash_transactions SET account_id=$2,description=$3,category=$4,direction=$5,amount=$6,due_date=$7,paid_date=$8,status=$9,cash_flow_line=$10,variance_note=$11 WHERE company_id=$1 AND id=$12",
        [...values, data.id],
      );
      if (!r.rowCount) throw new Error("Transaction not found.");
    } else
      await client.query(
        "INSERT INTO cash_transactions(company_id,account_id,description,category,direction,amount,due_date,paid_date,status,cash_flow_line,variance_note,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [...values, auth.user.id],
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
export async function removeTransaction(transactionId: string, companyId: string) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(companyId, "write_cash", client);
    await client.query("SELECT set_config('app.actor_id',$1,true)", [auth.user.id]);
    const forecast = await client.query(
      "SELECT forecast_amount FROM cash_transactions WHERE id=$1 AND company_id=$2 FOR UPDATE",
      [transactionId, companyId],
    );
    if (forecast.rows[0]?.forecast_amount !== null && forecast.rowCount)
      throw new Error(
        "Cancel forecasted transactions instead of deleting them to preserve variance history.",
      );
    const r = await client.query("DELETE FROM cash_transactions WHERE id=$1 AND company_id=$2", [
      transactionId,
      companyId,
    ]);
    if (!r.rowCount) throw new Error("Transaction not found.");
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
