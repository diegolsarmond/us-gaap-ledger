import { db } from "./db.server";
import { authorizeCompany, setActor } from "./companies.server";
import { createAccountingEngine, createInitialCompanyData, type CompanyState, type UserPersona } from "./accounting-engine";
import { commandArgs, domains, type AccountingCommand } from "./accounting-model";
import type { PoolClient } from "pg";

function table(domain: string) { return 'ledger_' + domain.toLowerCase(); }
export function persona(user: {name:string}, permissions: {write_accounting:boolean;close_periods:boolean;manage_users:boolean}): UserPersona {
 return {name:user.name,title:"Usuário autenticado",role:permissions.write_accounting?"accounting_staff":"client_portal",allowedReportsOnly:!permissions.write_accounting,canCreateJournals:permissions.write_accounting,canClosePeriod:permissions.close_periods,canManageUsers:permissions.manage_users};
}
async function readState(companyId:string, client: Pick<PoolClient,"query"> = db()) {
 const state = createInitialCompanyData();
 for (const domain of domains) {
  const rows = await client.query(`SELECT data FROM ${table(domain)} WHERE company_id=$1 ORDER BY position`,[companyId]);
  (state[domain] as unknown[]) = rows.rows.map(r=>r.data);
 }
 return state;
}
export async function load(companyId:string) {
 const client = await db().connect();
 try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const auth = await authorizeCompany(companyId,undefined,client);
  const state = await readState(companyId,client);
  const revision = await client.query("SELECT revision FROM companies WHERE id=$1",[companyId]);
  await client.query("COMMIT");
  return {state,company:auth.company,revision:revision.rows[0].revision as number};
 } catch(e) {await client.query("ROLLBACK");throw e;} finally {client.release();}
}

export function validateState(state:CompanyState) {
 const accounts = new Set(state.accounts.map(a=>a.code));
 const projects = new Set(state.projects.map(p=>p.id));
 const files = new Set(state.statements.map(s=>s.id));
 const skus = new Set(state.inventory.map(i=>i.sku));
 const refs: {source_domain:string;source_id:string;account_id:string|null;project_id:string|null;statement_id:string|null}[]=[];
 const ref=(domain:string,id:string,account?:string,project?:string,file?:string)=>{
  if (account && !accounts.has(account)) throw new Error(`Cadastre a conta contábil ${account} antes de operar.`);
  if (project && !projects.has(project)) throw new Error("Projeto não pertence à empresa.");
  if (file && !files.has(file)) throw new Error("Extrato não pertence à empresa.");
  refs.push({source_domain:domain,source_id:id,account_id:account||null,project_id:project||null,statement_id:file||null});
 };
 for (const domain of domains) {
  const keys=(state[domain] as unknown as Record<string,unknown>[]).map(r=>String(domain==='accounts'||domain==='currencies'?r['code']:r['id']));
  if(new Set(keys).size!==keys.length) throw new Error(`Registro duplicado em ${domain}.`);
 }
 if(skus.size!==state.inventory.length) throw new Error("SKU duplicado.");
 for(const j of state.journals) {
  if(j.lines.length<2 || Math.abs(j.lines.reduce((s,l)=>s+l.debit-l.credit,0))>0.005) throw new Error("Lançamento contábil desbalanceado.");
  for(const l of j.lines) {
   if(!Number.isFinite(l.debit)||!Number.isFinite(l.credit)||l.debit<0||l.credit<0||(l.debit>0&&l.credit>0)) throw new Error("Débito/crédito inválido.");
   ref('journals',j.id,l.accountCode,l.projectId);
  }
 }
 for(const s of state.statements) ref('statements',s.id,s.accountCode);
 for(const s of state.stagingRows) ref('stagingRows',s.id,s.classifiedAccount,undefined,s.fileId);
 for(const i of state.invoices) {
  ref('invoices',i.id,undefined,i.projectId);
  const subtotal=Math.round(i.items.reduce((s,l)=>s+l.qty*l.unitPrice,0)*100)/100;
  const taxable=i.items.filter(l=>l.taxable).reduce((s,l)=>s+l.qty*l.unitPrice,0);
  const tax=i.taxExempt?0:Math.round(taxable*i.taxRate)/100;
  if(Math.abs(i.subtotal-subtotal)>0.011||Math.abs(i.taxAmount-tax)>0.011||Math.abs(i.total-i.subtotal-i.taxAmount)>0.011) throw new Error("Totais da fatura inválidos.");
  for(const l of i.items) if(l.isProduct&&(!l.sku||!skus.has(l.sku))) throw new Error("Produto não pertence à empresa.");
 }
 for(const b of state.bills) {
  ref('bills',b.id,undefined,b.projectId);
  if(Math.abs(b.items.reduce((s,l)=>s+l.amount,0)-b.usdAmount)>0.011) throw new Error("Total da conta a pagar inválido.");
  for(const l of b.items) { ref('bills',b.id,l.accountCode,l.projectId); if(l.isInventory&&(!l.sku||!skus.has(l.sku))) throw new Error("Estoque não pertence à empresa."); }
 }
 for(const c of state.currencies) if(c.code==='USD' ? (!c.isBaseCurrency||c.exchangeRateToUsd!==1||c.status!=='Active') : c.isBaseCurrency)throw new Error('USD é a única moeda base, com paridade 1.');
 for(const domain of ['paymentTerms','costCenters','expenseCategories','taxJurisdictions','projects'] as const){const codes=state[domain].map(r=>r.code);if(new Set(codes).size!==codes.length)throw new Error('Código duplicado.');}
 for(const p of [...state.expenseCategories,...state.taxJurisdictions]) ref('parameters',p.id,p.glAccountCode);
 const periods=[...state.fiscalPeriods].sort((a,b)=>a.startDate.localeCompare(b.startDate));
 for(let i=0;i<periods.length;i++) if(periods[i]!.startDate>periods[i]!.endDate||(i>0&&periods[i-1]!.endDate>=periods[i]!.startDate)) throw new Error("Períodos fiscais inválidos ou sobrepostos.");
 return refs;
}
export async function execute(input:{companyId:string;revision:number;command:string;args:unknown[]}) {
 if(!Object.hasOwn(commandArgs,input.command)) throw new Error("Operação inválida.");
 const command=input.command as AccountingCommand;
 // Optional positional arguments omitted by JSON serialization still have stable tuple positions.
 const raw=[...input.args];
 const schema=commandArgs[command];
 while(raw.length<schema.items.length) raw.push(undefined);
 const args=schema.parse(raw);
 const permission=['togglePeriodLock','addFiscalPeriod','updateFiscalPeriod','deleteFiscalPeriod','resetParametersToDefault'].includes(command)?'close_periods':'write_accounting';
 const client=await db().connect();
 try {
  await client.query("BEGIN");
  // Shared with profile/user edits so authorization cannot be revoked during a write.
  await client.query("SELECT pg_advisory_xact_lock(803003)");
  const auth=await authorizeCompany(input.companyId,permission,client);
  const locked=await client.query("SELECT revision FROM companies WHERE id=$1 FOR UPDATE",[input.companyId]);
  if(locked.rows[0].revision!==input.revision) throw new Error("Os dados foram alterados em outra sessão. Atualize a página e tente novamente.");
  await setActor(client,auth.user.id);
  const state=await readState(input.companyId,client);
  const engine=createAccountingEngine(state,auth.company,persona(auth.user,auth.permissions));
  const operation=engine.value[command] as (...a:unknown[])=>unknown;
  const result=operation(...args);
  if(result && typeof result==='object' && 'success' in result && !result.success) throw new Error(String('error' in result?result.error:'Operação recusada.'));
  const next=engine.getState();
  const refs=validateState(next);
  // Preserve posted journals; only the engine's explicit reversal may change their status.
  await client.query("DELETE FROM ledger_references WHERE company_id=$1",[input.companyId]);
  for(const domain of domains) {
   const values=next[domain] as unknown as Record<string,unknown>[];
   await client.query(`DELETE FROM ${table(domain)} WHERE company_id=$1`,[input.companyId]);
   if(values.length) await client.query(`INSERT INTO ${table(domain)}(company_id,id,position,data) SELECT $1, item->>'id', (item->>'position')::integer, item->'data' FROM jsonb_array_elements($2::jsonb) item`,[input.companyId,JSON.stringify(values.map((data,position)=>({id:domain==='accounts'||domain==='currencies'?data['code']:data['id'],position,data})))]);
  }
  for(const r of refs) await client.query("INSERT INTO ledger_references(company_id,source_domain,source_id,account_id,project_id,statement_id) VALUES($1,$2,$3,$4,$5,$6)",[input.companyId,r.source_domain,r.source_id,r.account_id,r.project_id,r.statement_id]);
  const company=engine.getCompany();
  const updated=await client.query("UPDATE companies SET revision=revision+1,cost_method=$2,period_closed=$3,active_period=$4 WHERE id=$1 RETURNING revision",[input.companyId,company.costMethod,company.isPeriodClosed,company.activePeriod]);
  await client.query("INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,company_id) VALUES($1,$2,$3,'Accounting',$4,$5)",[auth.user.id,auth.user.name,command,input.companyId,input.companyId]);
  await client.query("COMMIT");
  return {state:next,company,revision:updated.rows[0].revision as number,result:result??{success:true}};
 } catch(e) {await client.query("ROLLBACK");throw e;} finally {client.release();}
}
