import { z } from "zod";
import { dateSchema as date } from "./cash-flow-model";
const text = z.string().max(2000), key = z.string().min(1).max(120), num = z.number().finite().min(0).max(1e14);
const status = z.enum(["Active", "Inactive"]);
const projectId = key.optional();
export const account = z.object({code:key,name:key,type:z.enum(["Asset","Liability","Equity","Revenue","COGS","Operating Expense","Other Income","Other Expense"]),balanceType:z.enum(["Debit","Credit"]),description:text});
const line = z.object({id:key,accountCode:key,debit:num,credit:num,memo:text.optional(),projectId});
export const journalInput = z.object({date,memo:text,sourceType:z.enum(["Invoice","Bill","Payment","Manual","OpeningBalance","InventoryAdjustment","BankStaging"]),sourceId:key.optional(),currency:key.optional(),fxRate:num.positive().optional(),lines:z.array(line.omit({id:true})).min(2).max(1000),overrideReason:text.optional()});
export const inventory = z.object({id:key,sku:key,name:key,type:z.enum(["Product","Service"]),qtyOnHand:num,unitCost:num,unitPrice:num,valuationMethod:z.enum(["FIFO","WeightedAverage"]),costLots:z.array(z.object({id:key,qty:num,unitCost:num,date})).max(10000)});
export const invoice = z.object({id:key,customerName:key,customerEin:text.optional(),date,dueDate:date,kind:z.enum(["Product","Service","Mixed"]),items:z.array(z.object({id:key,description:text,sku:key.optional(),isProduct:z.boolean(),qty:num.positive(),unitPrice:num,taxable:z.boolean()})).min(1).max(1000),subtotal:num,taxRate:num.max(100),taxAmount:num,total:num,taxExempt:z.boolean(),status:z.enum(["Open","Paid","Overdue"]),projectId,paymentDate:date.optional()});
export const bill = z.object({id:key,vendorName:key,billNumber:key,date,dueDate:date,currency:key,fxRate:num.positive(),foreignAmount:num,usdAmount:num,items:z.array(z.object({id:key,description:text,accountCode:key,isInventory:z.boolean(),sku:key.optional(),qty:num.positive().optional(),amount:num,projectId})).min(1).max(1000),status:z.enum(["Open","Paid"]),paymentDate:date.optional(),paidFxRate:num.positive().optional(),realizedFxDiff:z.number().finite().optional(),projectId});
export const project = z.object({id:key,code:key,name:key,clientName:text,budget:num,contractValue:num,status:z.enum(["Active","Completed","On Hold"]),startDate:date,endDate:date,notes:text});
export const currency = z.object({code:z.string().regex(/^[A-Z]{3}$/),name:key,symbol:key,exchangeRateToUsd:num.positive(),isBaseCurrency:z.boolean(),quotationType:z.enum(["Fixed","Float","Central Bank"]),status,lastUpdated:date});
export const jurisdiction = z.object({id:key,code:key,state:key,name:key,rate:num.max(100),taxType:z.enum(["State Sales Tax","Local Surcharge","Combined"]),glAccountCode:key,filingFrequency:z.enum(["Monthly","Quarterly","Annual"]),status});
export const term = z.object({id:key,code:key,name:key,days:num.int(),earlyDiscountPercentage:num.max(100).optional(),discountDays:num.int().optional(),isDefaultCustomer:z.boolean(),isDefaultVendor:z.boolean(),status});
export const center = z.object({id:key,code:key,name:key,manager:text,annualBudget:num,description:text,status});
export const category = z.object({id:key,code:key,name:key,glAccountCode:key,taxDeductibility:z.enum(["100% Deductible","50% Meals & Ent.","Non-Deductible"]),description:text,status});
export const period = z.object({id:key,periodCode:key,fiscalYear:key,startDate:date,endDate:date,status:z.enum(["Open","Soft-Close","Locked"]),closedBy:text.optional(),closingDate:date.optional(),notes:text.optional()});
export const commandArgs = {
 addAccount:z.tuple([account]),postJournalEntry:z.tuple([journalInput]),reverseJournalEntry:z.tuple([key,text.min(5)]),togglePeriodLock:z.tuple([text.optional()]),
 addInventoryItem:z.tuple([inventory.omit({id:true,costLots:true})]),adjustStock:z.tuple([key,z.number().finite(),num,text]),setCostMethod:z.tuple([z.enum(["FIFO","WeightedAverage"])]),
 createInvoice:z.tuple([invoice.omit({id:true,status:true})]),recordInvoicePayment:z.tuple([key,date]),createBill:z.tuple([bill.omit({id:true,status:true,usdAmount:true})]),payBill:z.tuple([key,date,num.positive().optional()]),
 createProject:z.tuple([project.omit({id:true})]),importStatement:z.tuple([z.object({name:key,type:z.literal("CSV"),accountCode:key,content:z.string().max(2_000_000)})]),classifyStagingRow:z.tuple([key,key]),recordTaxRemittance:z.tuple([key,key]),
 addCurrency:z.tuple([currency]),updateCurrency:z.tuple([key,currency.partial()]),deleteCurrency:z.tuple([key]),
 addTaxJurisdiction:z.tuple([jurisdiction.omit({id:true})]),updateTaxJurisdiction:z.tuple([key,jurisdiction.omit({id:true}).partial()]),deleteTaxJurisdiction:z.tuple([key]),
 addPaymentTerm:z.tuple([term.omit({id:true})]),updatePaymentTerm:z.tuple([key,term.omit({id:true}).partial()]),deletePaymentTerm:z.tuple([key]),
 addCostCenter:z.tuple([center.omit({id:true})]),updateCostCenter:z.tuple([key,center.omit({id:true}).partial()]),deleteCostCenter:z.tuple([key]),
 addExpenseCategory:z.tuple([category.omit({id:true})]),updateExpenseCategory:z.tuple([key,category.omit({id:true}).partial()]),deleteExpenseCategory:z.tuple([key]),
 addFiscalPeriod:z.tuple([period.omit({id:true})]),updateFiscalPeriod:z.tuple([key,period.omit({id:true}).partial()]),deleteFiscalPeriod:z.tuple([key]),resetParametersToDefault:z.tuple([]),
};
export type AccountingCommand = keyof typeof commandArgs;
export const domains = ["accounts","journals","inventory","projects","invoices","bills","statements","stagingRows","taxes","auditLogs","currencies","taxJurisdictions","paymentTerms","costCenters","expenseCategories","fiscalPeriods"] as const;
