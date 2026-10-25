import { db } from "./db.server";
import { readSession } from "./auth.server";
import { parameterSchemas, type mutationSchema } from "./parameters-model";
import type { z } from "zod";
async function access(companyId?: string) {
 const user = await readSession(); if (!user) throw new Error("Sessão expirada.");
 const result = await db().query(`SELECT c.id,c.data,p.write_accounting,p.close_periods,p.system_admin FROM companies c JOIN app_users u ON u.id=$1 AND u.active JOIN access_profiles p ON p.id=u.profile_id WHERE c.active AND ($2::uuid IS NULL OR c.id=$2) AND (p.system_admin OR p.all_companies OR EXISTS(SELECT 1 FROM profile_companies pc WHERE pc.profile_id=p.id AND pc.company_id=c.id)) ORDER BY c.data->>'name'`, [user.id,companyId ?? null]);
 if(companyId && !result.rowCount) throw new Error("Empresa indisponível ou sem acesso.");
 return { user, rows: result.rows };
}
export async function listParameterCompanies() { const a = await access(); return a.rows.map(r => ({...r.data,id:r.id,baseCurrency:"USD"})); }
export async function readParameters(companyId: string) {
 const a = await access(companyId);
 const result: Record<string, any[]> = {};
 for(const domain of Object.keys(parameterSchemas)) { const r = await db().query('SELECT data FROM ledger_'+domain.toLowerCase()+' WHERE company_id=$1 ORDER BY position,id',[companyId]); result[domain]=r.rows.map(r=>r.data); }
 const accounts = await db().query('SELECT data FROM ledger_accounts WHERE company_id=$1 ORDER BY position,id',[companyId]);
 const revision = await db().query('SELECT revision FROM parameter_revision WHERE company_id=$1',[companyId]);
 return { ...result, accounts:accounts.rows.map(r=>r.data), revision:revision.rows[0]?.revision ?? 0, userPersona:{name:a.user.name,canClosePeriod:!!a.rows[0].close_periods,canManageUsers:!!a.rows[0].system_admin}, canWrite:!!a.rows[0].write_accounting };
}
export async function writeParameter(input: z.infer<typeof mutationSchema>) {
 const a = await access(input.companyId);
 if(!(input.domain === "fiscalPeriods" ? a.rows[0].close_periods : a.rows[0].write_accounting)) throw new Error("Seu perfil não permite esta alteração.");
 const c = await db().connect();
 try { await c.query('BEGIN');
 await c.query("SELECT set_config('app.actor_id',$1,true)",[a.user.id]);
 await c.query('INSERT INTO parameter_revision(company_id) VALUES($1) ON CONFLICT DO NOTHING',[input.companyId]);
 const rev = await c.query('SELECT revision FROM parameter_revision WHERE company_id=$1 FOR UPDATE',[input.companyId]);
 if(rev.rows[0].revision !== input.revision) throw new Error("Dados alterados por outro usuário. Atualize a página e tente novamente.");
 const table = 'ledger_'+input.domain.toLowerCase();
 const old = await c.query('SELECT data FROM '+table+' WHERE company_id=$1 AND id=$2',[input.companyId,input.id]);
 if(input.operation !== 'create' && !old.rowCount) throw new Error("Registro não encontrado.");
 if(input.operation === 'create' && old.rowCount) throw new Error("Código já cadastrado.");
 if(input.domain === 'currencies' && input.id === 'USD' && input.operation === 'delete') throw new Error("A moeda funcional USD não pode ser excluída.");
 if(input.operation === 'delete') {
 if(input.domain==='fiscalPeriods' && old.rows[0].data.status!=='Open') throw new Error("Reabra o período antes de excluir.");
 await c.query('DELETE FROM '+table+' WHERE company_id=$1 AND id=$2',[input.companyId,input.id]);
 } else {
 const value = parameterSchemas[input.domain].parse(input.value) as Record<string, any>;
 if((input.domain === 'currencies' ? value['code'] : value['id']) !== input.id) throw new Error("Identificador inválido.");
 const key = input.domain === 'fiscalPeriods' ? 'periodCode' : 'code';
 const duplicate = await c.query('SELECT id FROM '+table+" WHERE company_id=$1 AND id<>$2 AND data->>$3=$4",[input.companyId,input.id,key,value[key]]);
 if(duplicate.rowCount) throw new Error("Código já cadastrado nesta empresa.");
 if(input.domain === 'fiscalPeriods') {
 const overlap = await c.query("SELECT id FROM ledger_fiscalperiods WHERE company_id=$1 AND id<>$2 AND data->>'startDate'<=$3 AND data->>'endDate'>=$4",[input.companyId,input.id,value['endDate'],value['startDate']]);
 if(overlap.rowCount) throw new Error("Datas sobrepostas a outro período fiscal.");
 value['closedBy']=value['status']==='Open' ? undefined : a.user.name; value['closingDate']=value['status']==='Open' ? undefined : new Date().toISOString();
 }
 if(input.domain==='taxJurisdictions' || input.domain==='expenseCategories') {
 const account = await c.query("SELECT data FROM ledger_accounts WHERE company_id=$1 AND data->>'code'=$2",[input.companyId,value['glAccountCode']]);
 const validTypes = input.domain==='taxJurisdictions' ? ['Liability'] : ['Expense','COGS','Cost of Goods Sold'];
 if(!account.rowCount || !validTypes.includes(account.rows[0].data.type)) throw new Error("Selecione uma conta contábil compatível cadastrada nesta empresa.");
 }
 if(input.domain==='paymentTerms') for(const field of ['isDefaultCustomer','isDefaultVendor']) if(value[field]) await c.query('UPDATE '+table+" SET data=jsonb_set(data,ARRAY[$2], 'false'::jsonb) WHERE company_id=$1 AND id<>$3 AND data->>$2='true'",[input.companyId,field,input.id]);
 if(input.operation==='create') await c.query('INSERT INTO '+table+'(company_id,id,position,data) VALUES($1,$2,(SELECT coalesce(max(position),0)+1 FROM '+table+' WHERE company_id=$1),$3)',[input.companyId,input.id,JSON.stringify(value)]);
 else await c.query('UPDATE '+table+' SET data=$3 WHERE company_id=$1 AND id=$2',[input.companyId,input.id,JSON.stringify(value)]);
 }
 await c.query('UPDATE parameter_revision SET revision=revision+1 WHERE company_id=$1',[input.companyId]);
 await c.query('COMMIT'); return {ok:true};
 } catch(e) { await c.query('ROLLBACK'); throw e; } finally {c.release();}
}
