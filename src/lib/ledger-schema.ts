// Explicit persistence contract. Objects are flattened; collections use owned child tables.
export type Field = { path: string; column: string; type: string; optional: boolean };
export type LedgerSchema = { fields: Field[]; children: Record<string, Field[]> };
const fields = (spec: string): Field[] =>
  spec
    .split(/\s+/)
    .filter(Boolean)
    .map((entry) => {
      const [raw = "", type = "text"] = entry.split(":");
      const path = raw.replace("?", "");
      return {
        path,
        column: path.replace(/\./g, "_").replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
        type,
        optional: raw.endsWith("?"),
      };
    });
const schema = (spec: string, children: Record<string, string> = {}): LedgerSchema => ({
  fields: fields(spec),
  children: Object.fromEntries(
    Object.entries(children).map(([key, value]) => [key, fields(value)]),
  ),
});
const scope = " scope? sharedId?:uuid";
const scopeChildren = { companyIds: "value:uuid" };
const dimensionValues = "dimensionId valueId lineId?";
const transaction =
  " transactionCurrency transactionAmount:numeric functionalCurrency exchangeRateValue:numeric functionalAmount:numeric exchangeRateSource exchangeRateDate?:date";
const payments =
  "id date:date transactionCurrency transactionAmount:numeric functionalCurrency exchangeRateValue:numeric functionalAmount:numeric bookAmount:numeric realizedGain:numeric discountAmount?:numeric cashFunctionalAmount?:numeric bankAccountId?:uuid journalId exchangeRateSource exchangeRateDate?:date";
const contact =
  "id displayName title firstName middleName lastName suffix companyName sourceOpenBalance?:numeric sourceBalanceDate?:date phone mobile fax website email sourceCurrency paymentTermId taxId notes";
export const ledgerSchemas: Record<string, LedgerSchema> = {
  dimensions: schema(
    "id code name status required:boolean applyInvoices:boolean applyBills:boolean",
    {
      options: "id code name status",
    },
  ),
  customers: schema(
    contact +
      " registrationStatus customerType? printOnChecksAs billingAddress.street billingAddress.city billingAddress.state billingAddress.zip billingAddress.country shippingAddress.street shippingAddress.city shippingAddress.state shippingAddress.zip shippingAddress.country shippingSameAsBilling:boolean paymentMethod deliveryMethod taxExempt:boolean exemptionReason defaultTaxCode parentCustomerId billWithParent:boolean",
    { attachments: "id:uuid name size:integer content", customFields: "name type value" },
  ),
  vendors: schema(
    contact +
      " printOnCheckAs cc bcc otherContact streetAddress streetAddress2 city stateProvince zipCode country defaultExpenseAccountCode accountNumber track1099:boolean costRate?:numeric billingRate?:numeric bankName routingNumber bankAccountNumber bankAccountType",
    {
      addressLines: "line",
      customFields: "name type value",
      bankAccounts:
        "id:uuid label currency bankName accountNumber routingNumber swiftBic paymentType",
    },
  ),
  accounts: schema(
    "code name type balanceType description subgroup? detailType? maturity? isContra?:boolean track1099?:boolean parentCode?",
  ),
  journals: schema(
    "id date:date memo sourceType sourceId? currency fxRate:numeric status overrideReason? createdBy createdAt",
    {
      lines: "id accountCode debit:numeric credit:numeric memo? projectId? costCenterId?",
      dimensionValues,
    },
  ),
  inventory: schema(
    "id sku name type qtyOnHand:numeric unitCost:numeric unitPrice:numeric valuationMethod",
    { costLots: "id qty:numeric unitCost:numeric date:date" },
  ),
  projects: schema(
    "id code name clientName customerId? budget:numeric contractValue:numeric status startDate:date endDate:date notes",
  ),
  invoices: schema(
    "earlyDiscountPercentage?:numeric discountDays?:integer costCenterId? id customerName customerId? customerEin? date:date dueDate:date kind subtotal:numeric taxRate:numeric taxAmount:numeric total:numeric taxExempt:boolean status projectId? paymentDate?:date" +
      transaction,
    {
      items: "id description sku? isProduct:boolean qty:numeric unitPrice:numeric taxable:boolean",
      dimensionValues,
      payments,
    },
  ),
  bills: schema(
    "earlyDiscountPercentage?:numeric discountDays?:integer costCenterId? id vendorId? vendorName billNumber date:date dueDate:date currency fxRate:numeric foreignAmount:numeric usdAmount:numeric status paymentDate?:date paidFxRate?:numeric realizedFxDiff?:numeric projectId?" +
      transaction,
    {
      items:
        "id description accountCode isInventory:boolean sku? qty?:numeric amount:numeric projectId?",
      dimensionValues,
      payments,
    },
  ),
  statements: schema(
    "id content? fileName accountCode fileType rowsCount:integer uploadedAt uploadedBy status",
  ),
  stagingRows: schema(
    "id fileId date:date description amount:numeric suggestedAccount classifiedAccount? status",
  ),
  taxes: schema(
    "id jurisdiction period taxableBase:numeric rate dueAmount:numeric status receiptFileName? paidAt?",
  ),
  auditLogs: schema("id timestamp actor role action targetType targetId details overrideReason?"),
  currencies: schema("code id? name isBaseCurrency:boolean status" + scope, scopeChildren),
  taxJurisdictions: schema(
    "id code state name rate:numeric taxType glAccountCode filingFrequency status" + scope,
    scopeChildren,
  ),
  paymentTerms: schema(
    "id code name days:integer earlyDiscountPercentage?:numeric discountDays?:integer isDefaultCustomer:boolean isDefaultVendor:boolean status" +
      scope,
    scopeChildren,
  ),
  costCenters: schema(
    "id code name manager annualBudget:numeric description status" + scope,
    scopeChildren,
  ),
  expenseCategories: schema(
    "id code name glAccountCode taxDeductibility description status" + scope,
    scopeChildren,
  ),
  postingAccounts: schema("id code name glAccountCode status" + scope, scopeChildren),
  fiscalPeriods: schema(
    "id periodCode fiscalYear startDate:date endDate:date status closedBy? closingDate? notes?" +
      scope,
    scopeChildren,
  ),
};
ledgerSchemas["accounts"]!.fields.find((field) => field.path === "parentCode")!.column =
  "parent_account_code";
ledgerSchemas["currencies"]!.fields.find((field) => field.path === "id")!.column = "record_id";
export const ledgerTable = (domain: string) => {
  if (!Object.hasOwn(ledgerSchemas, domain)) throw new Error("Invalid ledger domain");
  return "ledger_" + domain.toLowerCase();
};
export const childTable = (domain: string, collection: string) =>
  ledgerTable(domain) + "_" + collection.toLowerCase();
