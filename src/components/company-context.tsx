import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadCompanies } from "@/lib/companies";
import type { Company } from "@/lib/company-model";
import type { Permissions } from "@/lib/admin-model";
type Value={companies:Company[];activeCompany:Company|null;selectCompany:(id:string)=>void;permissions:Permissions;user:{id:string;name:string;email:string};refresh:()=>Promise<unknown>};
const Context=createContext<Value|null>(null);
export function CompanyProvider({children}:{children:ReactNode}) {
 const query=useQuery({queryKey:['companies'],queryFn:()=>loadCompanies(),refetchOnWindowFocus:true,refetchInterval:30000});
 const [selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{setSelected(localStorage.getItem('ledger_active_company'));},[]);
 const companies=query.data?.companies??[];
 const activeCompany=companies.find(c=>c.active&&c.id===selected)??companies.find(c=>c.active)??null;
 if(query.isPending) return <p className="p-6" role="status">Carregando empresas…</p>;
 if(query.isError) return <div className="p-6" role="alert">Não foi possível carregar as empresas. Verifique as migrações 004 e 005. <button onClick={()=>void query.refetch()}>Tentar novamente</button></div>;
 const selectCompany=(id:string)=>{if(!companies.some(c=>c.id===id&&c.active))return;setSelected(id);localStorage.setItem('ledger_active_company',id);};
 return <Context.Provider value={{companies,activeCompany,selectCompany,permissions:query.data!.permissions,user:query.data!.user,refresh:()=>query.refetch()}}>{children}</Context.Provider>;
}
export function useCompanies(){const value=useContext(Context);if(!value)throw new Error('CompanyProvider ausente');return value;}
