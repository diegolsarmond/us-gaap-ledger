import { z } from "zod";
import { resolveAccount } from "./coa";
import type { Account } from "./accounting-engine";
export const postingRoles = {
 salesDiscount: { name: "Customer early-payment discounts", preferred: "40900", legacy: "40200", type: "Revenue" },
 purchaseDiscount: { name: "Vendor early-payment discounts", preferred: "80400", legacy: "80200", type: "Other Income" },
 ar: { name: "Accounts receivable", preferred: "11000", legacy: "1100", type: "Asset" },
 ap: { name: "Accounts payable", preferred: "20100", legacy: "2000", type: "Liability" },
 productRevenue: { name: "Product revenue", preferred: "40100", legacy: "4100", type: "Revenue" },
 serviceRevenue: { name: "Service revenue", preferred: "40200", legacy: "4000", type: "Revenue" },
 inventory: { name: "Inventory", preferred: "13000", legacy: "1300", type: "Asset" },
 cogs: { name: "Cost of goods sold", preferred: "50100", legacy: "5000", type: "COGS" },
 cash: { name: "Settlement cash", preferred: "10200", legacy: "1000", type: "Asset" },
 salesTax: { name: "Sales tax payable", preferred: "22100", legacy: "2200", type: "Liability" },
 fx: { name: "Exchange gains / losses", preferred: "80300", legacy: "6300", type: "Other Income" },
} as const;
export const postingRoleSchema = z.enum(Object.keys(postingRoles) as [keyof typeof postingRoles, ...Array<keyof typeof postingRoles>]);
export type PostingAccount = { id: string; code: keyof typeof postingRoles; name: string; glAccountCode: string; status: "Active" | "Inactive"; scope?: "global" | "companies"; companyIds?: string[]; sharedId?: string };
export function resolvePostingAccount(accounts: Account[], mappings: PostingAccount[], preferred: string, legacy: string) {
 const role = Object.values(postingRoles).find((r) => r.preferred === preferred);
 const code = (Object.keys(postingRoles) as Array<keyof typeof postingRoles>).find((k) => postingRoles[k] === role);
 const mapped = mappings.find((m) => m.code === code && m.status === "Active");
 return mapped?.glAccountCode ?? resolveAccount(accounts, preferred, legacy);
}
