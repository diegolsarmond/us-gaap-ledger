import { db } from "./db.server";
import { authorizeCompany } from "./companies.server";
import type { CashAccount, CashTransaction, CashData } from "./cash-flow-model";
export async function load(companyId:string): Promise<CashData> {
  await authorizeCompany(companyId);
  const id=companyId;
  const [accounts, transactions] = await Promise.all([
    db().query(
      "SELECT id, name, currency, opening_date::text, opening_balance::float8 FROM cash_accounts WHERE company_id=$1 ORDER BY name",
      [id],
    ),
    db().query(
      "SELECT id, account_id, description, category, direction, amount::float8, due_date::text, paid_date::text, status FROM cash_transactions WHERE company_id=$1 ORDER BY due_date DESC, created_at DESC",
      [id],
    ),
  ]);
  return { accounts: accounts.rows, transactions: transactions.rows };
}
export async function saveAccount(data: Omit<CashAccount, "id"> & { id?: string | undefined;companyId:string }) {
  const auth=await authorizeCompany(data.companyId,"write_cash");
  const id=data.companyId;
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    await authorizeCompany(id,"write_cash",client);
    await client.query("SELECT set_config('app.actor_id',$1,true)",[auth.user.id]);
    if (data.id) {
      const account = await client.query(
        "SELECT currency FROM cash_accounts WHERE id=$1 AND company_id=$2 FOR UPDATE",
        [data.id, id],
      );
      if (!account.rowCount) throw new Error("Conta não encontrada.");
      const movements = await client.query(
        "SELECT count(*)::int AS count, min(least(due_date, paid_date))::text AS first_date FROM cash_transactions WHERE account_id=$1 AND company_id=$2",
        [data.id, id],
      );
      const history = movements.rows[0];
      if (history.count > 0 && data.currency !== account.rows[0].currency)
        throw new Error("A moeda não pode ser alterada em uma conta com lançamentos.");
      if (history.first_date && data.opening_date > history.first_date)
        throw new Error("A data inicial não pode ser posterior aos lançamentos existentes.");
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
      throw new Error("Já existe uma conta com esse nome.");
    throw error;
  } finally {
    client.release();
  }
  return { ok: true };
}
export async function saveTransaction(data: Omit<CashTransaction,"id"> & {id?:string|undefined;companyId:string}) {
 const client=await db().connect();
 try {
  await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(803003)");
  const auth=await authorizeCompany(data.companyId,"write_cash",client);
  await client.query("SELECT set_config('app.actor_id',$1,true)",[auth.user.id]);
  const account=await client.query("SELECT opening_date::text FROM cash_accounts WHERE id=$1 AND company_id=$2 FOR UPDATE",[data.account_id,data.companyId]);
  if(!account.rowCount)throw new Error("Conta não pertence à empresa.");
  if(data.due_date<account.rows[0].opening_date||(data.paid_date&&data.paid_date<account.rows[0].opening_date))throw new Error("As datas devem ser iguais ou posteriores à abertura da conta.");
  const values=[data.companyId,data.account_id,data.description,data.category,data.direction,data.amount,data.due_date,data.paid_date,data.status];
  if(data.id){const r=await client.query("UPDATE cash_transactions SET account_id=$2,description=$3,category=$4,direction=$5,amount=$6,due_date=$7,paid_date=$8,status=$9 WHERE company_id=$1 AND id=$10",[...values,data.id]);if(!r.rowCount)throw new Error("Lançamento não encontrado.");}
  else await client.query("INSERT INTO cash_transactions(company_id,account_id,description,category,direction,amount,due_date,paid_date,status,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[...values,auth.user.id]);
  await client.query("COMMIT");return {ok:true};
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
export async function removeTransaction(transactionId:string,companyId:string){
 const client=await db().connect();
 try{
  await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(803003)");
  const auth=await authorizeCompany(companyId,"write_cash",client);await client.query("SELECT set_config('app.actor_id',$1,true)",[auth.user.id]);
  const r=await client.query("DELETE FROM cash_transactions WHERE id=$1 AND company_id=$2",[transactionId,companyId]);if(!r.rowCount)throw new Error("Lançamento não encontrado.");
  await client.query("COMMIT");return {ok:true};
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
