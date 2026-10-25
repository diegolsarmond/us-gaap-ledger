import { authorizeCompany } from "./companies.server";
import { load, execute } from "./accounting.server";
import { parameterSchemas, type mutationSchema } from "./parameters-model";
import type { z } from "zod";
export async function listParameterCompanies(){return (await (await import('./companies.server')).listCompanies()).companies.filter(c=>c.active);}
export async function readParameters(companyId:string){
 const auth=await authorizeCompany(companyId);
 const data=await load(companyId);
 return {...data.state,revision:data.revision,userPersona:{name:auth.user.name,canClosePeriod:auth.permissions.close_periods,canManageUsers:auth.permissions.manage_users},canWrite:auth.permissions.write_accounting};
}
export async function writeParameter(input:z.infer<typeof mutationSchema>){
 const suffix={currencies:'Currency',taxJurisdictions:'TaxJurisdiction',paymentTerms:'PaymentTerm',costCenters:'CostCenter',expenseCategories:'ExpenseCategory',fiscalPeriods:'FiscalPeriod'}[input.domain];
 const value=input.operation==='delete'?undefined:parameterSchemas[input.domain].parse(input.value);
 const command=(input.operation==='create'?'add':input.operation)+suffix;
 await execute({companyId:input.companyId,revision:input.revision,command,args:input.operation==='create'?[value]:input.operation==='delete'?[input.id]:[input.id,value]});
 return {ok:true};
}
