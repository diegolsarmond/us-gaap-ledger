import React, { createContext, useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadParameterCompanies, loadParameters, mutateParameter } from "./parameters";
import type { ParameterDomain } from "./parameters-model";
import type * as Models from "./accounting-store";
export type { CurrencyParam, TaxJurisdictionParam, PaymentTermParam, CostCenterParam, ExpenseCategoryParam, FiscalPeriodParam } from "./accounting-store";
type Rows = { currencies: Models.CurrencyParam[]; taxJurisdictions: Models.TaxJurisdictionParam[]; paymentTerms: Models.PaymentTermParam[]; costCenters: Models.CostCenterParam[]; expenseCategories: Models.ExpenseCategoryParam[]; fiscalPeriods: Models.FiscalPeriodParam[] };
type Methods = { [K in keyof Rows as `add${K extends 'currencies' ? 'Currency' : K extends 'taxJurisdictions' ? 'TaxJurisdiction' : K extends 'paymentTerms' ? 'PaymentTerm' : K extends 'costCenters' ? 'CostCenter' : K extends 'expenseCategories' ? 'ExpenseCategory' : 'FiscalPeriod'}`]: (value: Omit<Rows[K][number], 'id'>) => Promise<void> } & { [key: string]: any };
const Context = createContext<(Rows & Methods & {activeCompany:Models.ClientCompany; accounts:Models.Account[]; userPersona:{name:string;canClosePeriod:boolean;canManageUsers:boolean}}) | null>(null);
export function useAccounting() { const value=useContext(Context); if(!value) throw new Error("ParametersProvider ausente"); return value; }
export function ParametersProvider({children}:{children:React.ReactNode}) {
 const companies=useQuery({queryKey:['parameter-companies'],queryFn:()=>loadParameterCompanies()});
 const [selected,setSelected]=useState('');
 const activeCompany=companies.data?.find(c=>c.id===selected) ?? companies.data?.[0];
 const query=useQuery({queryKey:['parameters',activeCompany?.id],queryFn:()=>loadParameters({data:{companyId:activeCompany!.id}}),enabled:!!activeCompany});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 if(companies.isPending) return <p role="status">Carregando empresas…</p>;
 if(companies.error || query.error) return <div role="alert">{(companies.error || query.error)?.message}<button onClick={()=>{void companies.refetch();void query.refetch();}}>Tentar novamente</button></div>;
 if(!activeCompany) return <p>Nenhuma empresa disponível. Cadastre uma empresa no Fluxo de Caixa ou solicite acesso ao administrador.</p>;
 if(!query.data) return <p role="status">Carregando parâmetros…</p>;
 const data=query.data;
 const methods:Record<string,unknown>={};
 const names:Record<ParameterDomain,string>={currencies:'Currency',taxJurisdictions:'TaxJurisdiction',paymentTerms:'PaymentTerm',costCenters:'CostCenter',expenseCategories:'ExpenseCategory',fiscalPeriods:'FiscalPeriod'};
 for(const [domain,name] of Object.entries(names)) for(const operation of ['add','update','delete']) methods[operation+name]=async (idOrValue:any, patch?:any)=>{
   setError('');setBusy(true);
   try {
    const rows=(data as any)[domain] as any[];
    const id=operation==='add' ? domain==='currencies' ? idOrValue.code : crypto.randomUUID() : idOrValue;
    const value=operation==='add' ? {...idOrValue,...(domain==='currencies'?{}:{id})} : operation==='update' ? {...rows.find(r=>(domain==='currencies'?r.code:r.id)===id),...patch} : undefined;
    await mutateParameter({data:{companyId:activeCompany.id,domain:domain as ParameterDomain,id,revision:data.revision,operation:operation==='add'?'create':operation==='update'?'update':'delete',value}});
    await query.refetch();
   } catch(e) {setError(e instanceof Error?e.message:'Falha ao salvar.');throw e;} finally {setBusy(false);}
 };
 return <Context.Provider value={{...data,...methods,activeCompany} as any}>
 <div className="mb-5 flex items-center gap-3"><label htmlFor="parameter-company">Empresa</label><select id="parameter-company" value={activeCompany.id} disabled={busy} onChange={e=>{setSelected(e.target.value);setError('');}} className="rounded border border-line p-2">{companies.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
 {error && <p role="alert" className="mb-4 text-down">{error}</p>}
 <fieldset disabled={busy || query.isFetching} className="min-w-0">{children}</fieldset>
 </Context.Provider>;
}
