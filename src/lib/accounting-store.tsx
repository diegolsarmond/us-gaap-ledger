import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { createAccountingEngine, type AccountingContextType, type UserPersona } from "./accounting-engine";
import { commandArgs, type AccountingCommand } from "./accounting-model";
import { loadAccounting, runAccountingCommand } from "./accounting";
export type * from "./accounting-engine";
type AsyncContext={ [K in keyof AccountingContextType]: AccountingContextType[K] extends (...args:infer A)=>infer R ? (...args:A)=>Promise<R> : AccountingContextType[K] };
const Context=createContext<AsyncContext|null>(null);
export function AccountingProvider({children}:{children:ReactNode}) {
 const {activeCompany,user,permissions}=useCompanies();
 if(!activeCompany)return <p role="status">Cadastre ou solicite acesso a uma empresa para começar.</p>;
 return <CompanyAccounting key={activeCompany.id} companyId={activeCompany.id} user={user} permissions={permissions}>{children}</CompanyAccounting>;
}
function CompanyAccounting({companyId,user,permissions,children}:{companyId:string;user:{name:string};permissions:ReturnType<typeof useCompanies>['permissions'];children:ReactNode}) {
 const client=useQueryClient();
 const query=useQuery({queryKey:['accounting',companyId],queryFn:()=>loadAccounting({data:{companyId}}),refetchOnWindowFocus:true});
 const busy=useRef(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const revision=useRef(0); revision.current=query.data?.revision??0;
 if(query.isPending)return <p role="status">Carregando dados da empresa…</p>;
 if(query.isError)return <div role="alert">Não foi possível acessar os dados da empresa. <button onClick={()=>void query.refetch()}>Tentar novamente</button></div>;
 const persona:UserPersona={name:user.name,title:'Usuário autenticado',role:permissions.write_accounting?'accounting_staff':'client_portal',allowedReportsOnly:!permissions.write_accounting,canClosePeriod:permissions.close_periods,canCreateJournals:permissions.write_accounting,canManageUsers:permissions.manage_users};
 const engine=createAccountingEngine(query.data!.state,query.data!.company,persona);
 const value={...engine.value} as unknown as AsyncContext;
 for(const command of Object.keys(commandArgs) as AccountingCommand[]) {
  Object.assign(value,{[command]:async (...args:unknown[])=>{
   if(busy.current)throw new Error('Aguarde a operação em andamento.');
   busy.current=true;setSaving(true);setError('');
   try {
    const result=await runAccountingCommand({data:{companyId,revision:revision.current,command,args}});
    revision.current=result.revision;
    client.setQueryData(['accounting',companyId],{state:result.state,company:result.company,revision:result.revision});
    return result.result;
   } catch(e) {const message=e instanceof Error?e.message:'Não foi possível salvar.';setError(message);await client.invalidateQueries({queryKey:['accounting',companyId]});throw e;}
   finally {busy.current=false;setSaving(false);}
  }});
 }
 return <Context.Provider value={value}>{error&&<p role="alert" className="mb-3 text-down">{error}</p>}<fieldset disabled={saving} className="min-w-0">{saving&&<p role="status">Salvando…</p>}{children}</fieldset></Context.Provider>;
}
export function useAccounting(){const value=useContext(Context);if(!value)throw new Error('AccountingProvider ausente');return value;}
