import {
  normalizedFx,
  outstanding,
  settlement,
  closingAdjustment,
  nextDay,
  money,
  type TransactionFx,
  type Payment,
} from "./transaction-fx";
import { US_GAAP_COA, totalByType, resolveAccount, validateCoa } from "./coa";
import {
  dimensionSchema,
  validateDimensionDefinitions,
  validateDimensionValues,
  effectiveDimensions,
  requireDimensions,
  isProfitLoss,
  type Dimension,
  type DimensionValue,
} from "./dimensions";
import { customerSchema, type Customer, type CustomerInput } from "./customer-model";
import { vendorSchema, type Vendor, type VendorInput } from "./vendor-model";
import { customerLinks, vendorLinks } from "./contact-usage";
import { parseStatementCsv } from "./statement-csv";

export type UserRole = "platform_admin" | "accounting_admin" | "accounting_staff" | "client_portal";

export interface UserPersona {
  role: UserRole;
  name: string;
  title: string;
  allowedReportsOnly: boolean;
  canClosePeriod: boolean;
  canManageUsers: boolean;
  canCreateJournals: boolean;
}

export type AccountType =
  | "Asset"
  | "Liability"
  | "Equity"
  | "Revenue"
  | "COGS"
  | "Operating Expense"
  | "Other Income"
  | "Other Expense";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  balanceType: "Debit" | "Credit";
  description: string;
  subgroup?: string | undefined;
  detailType?: string | undefined;
  maturity?: "Current" | "Noncurrent" | "Not Applicable" | "Unclassified" | undefined;
  isContra?: boolean | undefined;
  track1099?: boolean | undefined;
  parentCode?: string | undefined;
}

export interface JournalLine {
  id: string;
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string | undefined;
  projectId?: string | undefined;
}

export interface JournalEntry {
  dimensionValues?: DimensionValue[] | undefined;
  id: string;
  date: string;
  memo: string;
  sourceType:
    | "Invoice"
    | "Bill"
    | "Payment"
    | "Manual"
    | "OpeningBalance"
    | "InventoryAdjustment"
    | "BankStaging"
    | "FXRevaluation"
    | "FXReversal";
  sourceId?: string | undefined;
  currency: string;
  fxRate: number;
  lines: JournalLine[];
  status: "Posted" | "Reversed";
  overrideReason?: string | undefined;
  createdBy: string;
  createdAt: string;
}

export type ClientCompany = import("./company-model").Company;

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  type: "Product" | "Service";
  qtyOnHand: number;
  unitCost: number;
  unitPrice: number;
  valuationMethod: "FIFO" | "WeightedAverage";
  costLots: { id: string; qty: number; unitCost: number; date: string }[];
}

export interface InvoiceItem {
  id: string;
  description: string;
  sku?: string | undefined;
  isProduct: boolean;
  qty: number;
  unitPrice: number;
  taxable: boolean;
}

export interface Invoice extends TransactionFx {
  customerId?: string | undefined;
  dimensionValues?: DimensionValue[] | undefined;
  id: string;
  customerName: string;
  customerEin?: string | undefined;
  date: string;
  dueDate: string;
  kind: "Product" | "Service" | "Mixed";
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  taxExempt: boolean;
  status: "Open" | "Paid" | "Overdue" | "Partially Paid";
  projectId?: string | undefined;
  paymentDate?: string | undefined;
}

export interface BillItem {
  id: string;
  description: string;
  accountCode: string;
  isInventory: boolean;
  sku?: string | undefined;
  qty?: number | undefined;
  amount: number;
  projectId?: string | undefined;
}

export interface Bill extends TransactionFx {
  dimensionValues?: DimensionValue[] | undefined;
  id: string;
  vendorId?: string | undefined;
  vendorName: string;
  billNumber: string;
  date: string;
  dueDate: string;
  currency: string;
  fxRate: number;
  foreignAmount: number;
  usdAmount: number;
  items: BillItem[];
  status: "Open" | "Paid" | "Partially Paid";
  paymentDate?: string | undefined;
  paidFxRate?: number | undefined;
  realizedFxDiff?: number | undefined;
  projectId?: string | undefined;
}

export interface Project {
  customerId?: string | undefined;
  id: string;
  code: string;
  name: string;
  clientName: string;
  budget: number;
  contractValue: number;
  status: "Active" | "Completed" | "On Hold";
  startDate: string;
  endDate: string;
  notes: string;
}

export interface BankStatementFile {
  content?: string;
  id: string;
  fileName: string;
  accountCode: string;
  fileType: "CSV" | "OFX" | "PDF";
  rowsCount: number;
  uploadedAt: string;
  uploadedBy: string;
  status: "Reconciled" | "Pending Review";
}

export interface StagingRow {
  id: string;
  fileId: string;
  date: string;
  description: string;
  amount: number;
  suggestedAccount: string;
  classifiedAccount?: string | undefined;
  status: "Pending" | "Classified";
}

export interface TaxRecord {
  id: string;
  jurisdiction: string;
  period: string;
  taxableBase: number;
  rate: string;
  dueAmount: number;
  status: "Paid" | "Pending Remittance";
  receiptFileName?: string | undefined;
  paidAt?: string | undefined;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  overrideReason?: string | undefined;
}

export interface ParameterScope {
  scope?: "global" | "companies";
  companyIds?: string[];
  sharedId?: string;
}

export interface CurrencyParam extends ParameterScope {
  code: string;
  name: string;
  symbol?: string;
  exchangeRateToUsd?: number;
  isBaseCurrency: boolean;
  quotationType?: "Fixed" | "Float" | "Central Bank";
  status: "Active" | "Inactive";
  lastUpdated?: string;
}

export interface TaxJurisdictionParam extends ParameterScope {
  id: string;
  code: string;
  state: string;
  name: string;
  rate: number;
  taxType: "State Sales Tax" | "Local Surcharge" | "Combined";
  glAccountCode: string;
  filingFrequency: "Monthly" | "Quarterly" | "Annual";
  status: "Active" | "Inactive";
}

export interface PaymentTermParam extends ParameterScope {
  id: string;
  code: string;
  name: string;
  days: number;
  earlyDiscountPercentage?: number | undefined;
  discountDays?: number | undefined;
  isDefaultCustomer: boolean;
  isDefaultVendor: boolean;
  status: "Active" | "Inactive";
}

export interface CostCenterParam extends ParameterScope {
  id: string;
  code: string;
  name: string;
  manager: string;
  annualBudget: number;
  description: string;
  status: "Active" | "Inactive";
}

export interface ExpenseCategoryParam extends ParameterScope {
  id: string;
  code: string;
  name: string;
  glAccountCode: string;
  taxDeductibility: "100% Deductible" | "50% Meals & Ent." | "Non-Deductible";
  description: string;
  status: "Active" | "Inactive";
}

export interface FiscalPeriodParam extends ParameterScope {
  id: string;
  periodCode: string;
  fiscalYear: string;
  startDate: string;
  endDate: string;
  status: "Open" | "Soft-Close" | "Locked";
  closedBy?: string | undefined;
  closingDate?: string | undefined;
  notes?: string | undefined;
}

export interface CompanyState {
  dimensions: Dimension[];
  customers: Customer[];
  vendors: Vendor[];
  accounts: Account[];
  journals: JournalEntry[];
  inventory: InventoryItem[];
  projects: Project[];
  invoices: Invoice[];
  bills: Bill[];
  statements: BankStatementFile[];
  stagingRows: StagingRow[];
  taxes: TaxRecord[];
  auditLogs: AuditLogEntry[];
  currencies: CurrencyParam[];
  taxJurisdictions: TaxJurisdictionParam[];
  paymentTerms: PaymentTermParam[];
  costCenters: CostCenterParam[];
  expenseCategories: ExpenseCategoryParam[];
  fiscalPeriods: FiscalPeriodParam[];
}
export function createInitialCompanyData(_companyId?: string): CompanyState {
  return {
    dimensions: [],
    customers: [],
    accounts: [],
    journals: [],
    inventory: [],
    projects: [],
    invoices: [],
    bills: [],
    vendors: [],
    statements: [],
    stagingRows: [],
    taxes: [],
    auditLogs: [],
    currencies: [],
    taxJurisdictions: [],
    paymentTerms: [],
    costCenters: [],
    expenseCategories: [],
    fiscalPeriods: [],
  };
}

export interface AccountingContextType {
  dimensions: Dimension[];
  saveDimension: (dimension: Dimension) => void;
  customers: Customer[];
  addCustomer: (data: CustomerInput) => void;
  updateCustomer: (id: string, data: CustomerInput) => void;
  deleteCustomer: (id: string) => void;
  activeCompany: ClientCompany;
  companies: ClientCompany[];
  setActiveCompanyId: (id: string) => void;
  currentRole: UserRole;
  setCurrentRole: (r: UserRole) => void;
  userPersona: UserPersona;

  accounts: Account[];
  installUsGaapCoa: () => void;
  addAccount: (account: Account) => void;
  updateAccount: (code: string, data: Omit<Account, "code">) => void;
  deleteAccount: (code: string) => void;

  journals: JournalEntry[];
  postJournalEntry: (entry: {
    date: string;
    memo: string;
    sourceType: JournalEntry["sourceType"];
    sourceId?: string | undefined;
    currency?: string | undefined;
    fxRate?: number | undefined;
    lines: {
      accountCode: string;
      debit: number;
      credit: number;
      memo?: string | undefined;
      projectId?: string | undefined;
      dimensionValues?: DimensionValue[] | undefined;
    }[];
    overrideReason?: string | undefined;
  }) => { success: boolean; error?: string | undefined; entryId?: string | undefined };
  reverseJournalEntry: (
    id: string,
    reason: string,
  ) => { success: boolean; error?: string | undefined };

  togglePeriodLock: (reason?: string | undefined) => {
    success: boolean;
    error?: string | undefined;
  };

  inventory: InventoryItem[];
  addInventoryItem: (item: Omit<InventoryItem, "id" | "costLots">) => void;
  adjustStock: (itemId: string, qtyDelta: number, unitCost: number, memo: string) => void;
  setCostMethod: (method: "FIFO" | "WeightedAverage") => void;

  invoices: Invoice[];
  createInvoice: (inv: Omit<Invoice, "id" | "status">) => {
    success: boolean;
    error?: string | undefined;
    invoiceId?: string | undefined;
  };
  recordInvoicePayment: (
    invoiceId: string,
    paymentDate: string,
    settlementFxRate?: number,
    amount?: number,
    quote?: { source: string; date: string },
  ) => { success: boolean; error?: string | undefined };

  vendors: Vendor[];
  addVendor: (input: VendorInput) => string;
  updateVendor: (id: string, input: VendorInput) => void;
  deleteVendor: (id: string) => void;
  bills: Bill[];
  createBill: (b: Omit<Bill, "id" | "status" | "usdAmount">) => {
    success: boolean;
    error?: string | undefined;
    billId?: string | undefined;
  };
  payBill: (
    billId: string,
    paymentDate: string,
    settlementFxRate?: number | undefined,
    amount?: number,
    bankAccountId?: string,
    quote?: { source: string; date: string },
  ) => { success: boolean; error?: string | undefined };
  revalueOpenItems: (
    asOf: string,
    rates: Record<string, { rate: number; date: string; source: string }>,
  ) => { success: boolean; error?: string | undefined; count?: number | undefined };

  projects: Project[];
  createProject: (p: Omit<Project, "id">) => void;

  statements: BankStatementFile[];
  stagingRows: StagingRow[];
  importStatement: (file: {
    name: string;
    type: "CSV" | "OFX" | "PDF";
    accountCode: string;
    content: string;
  }) => void;
  classifyStagingRow: (rowId: string, targetAccountCode: string) => void;

  taxes: TaxRecord[];
  recordTaxRemittance: (taxId: string, receiptName: string) => void;

  auditLogs: AuditLogEntry[];

  // Parametrização do Sistema
  currencies: CurrencyParam[];
  addCurrency: (curr: CurrencyParam) => void;
  updateCurrency: (code: string, data: Partial<CurrencyParam>) => void;
  deleteCurrency: (code: string) => void;

  taxJurisdictions: TaxJurisdictionParam[];
  addTaxJurisdiction: (tax: Omit<TaxJurisdictionParam, "id">) => void;
  updateTaxJurisdiction: (id: string, data: Partial<TaxJurisdictionParam>) => void;
  deleteTaxJurisdiction: (id: string) => void;

  paymentTerms: PaymentTermParam[];
  addPaymentTerm: (term: Omit<PaymentTermParam, "id">) => void;
  updatePaymentTerm: (id: string, data: Partial<PaymentTermParam>) => void;
  deletePaymentTerm: (id: string) => void;

  costCenters: CostCenterParam[];
  addCostCenter: (cc: Omit<CostCenterParam, "id">) => void;
  updateCostCenter: (id: string, data: Partial<CostCenterParam>) => void;
  deleteCostCenter: (id: string) => void;

  expenseCategories: ExpenseCategoryParam[];
  addExpenseCategory: (cat: Omit<ExpenseCategoryParam, "id">) => void;
  updateExpenseCategory: (id: string, data: Partial<ExpenseCategoryParam>) => void;
  deleteExpenseCategory: (id: string) => void;

  fiscalPeriods: FiscalPeriodParam[];
  addFiscalPeriod: (period: Omit<FiscalPeriodParam, "id">) => void;
  updateFiscalPeriod: (id: string, data: Partial<FiscalPeriodParam>) => void;
  deleteFiscalPeriod: (id: string) => void;

  resetParametersToDefault: () => void;

  accountBalances: Record<string, { debit: number; credit: number; net: number }>;
  isLedgerBalanced: boolean;
  totalDebitSum: number;
  totalCreditSum: number;
  netIncome: number;
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  totalOpEx: number;
  operatingIncome: number;
  totalFXVariance: number;
  cashOnHand: number;
  totalAR: number;
  totalAP: number;
  totalInventoryValuation: number;
}

export function createAccountingEngine(
  currentData: CompanyState,
  initialCompany: ClientCompany,
  userPersona: UserPersona,
) {
  let activeCompany = { ...initialCompany };
  let nextData = structuredClone(currentData);
  const currentRole = userPersona.role;
  const companies = [activeCompany];
  const setActiveCompanyId = (_id: string) => {};
  const setCurrentRole = (_role: UserRole) => {};
  const setCompanies = (updater: (items: ClientCompany[]) => ClientCompany[]) => {
    activeCompany = updater([activeCompany])[0]!;
  };
  const updateCompanyData = (updater: (prev: CompanyState) => CompanyState) => {
    nextData = updater(nextData);
  };
  const addAuditLog = (
    action: string,
    targetType: string,
    targetId: string,
    details: string,
    overrideReason?: string | undefined,
  ) => {
    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp:
        new Date().toLocaleString("en-US", {
          timeZone: "America/New_York",
          dateStyle: "short",
          timeStyle: "medium",
        }) + " EST",
      actor: userPersona.name,
      role: userPersona.title,
      action,
      targetType,
      targetId,
      details,
      overrideReason,
    };
    updateCompanyData((prev) => ({
      ...prev,
      auditLogs: [newLog, ...prev.auditLogs],
    }));
  };

  const postJournalEntry: AccountingContextType["postJournalEntry"] = ({
    date,
    memo,
    sourceType,
    sourceId,
    currency = "USD",
    fxRate = 1.0,
    lines,
    overrideReason,
  }) => {
    if (!userPersona.canCreateJournals) {
      return {
        success: false,
        error: "Access denied: Client portal users cannot post journal entries.",
      };
    }

    const period = currentData.fiscalPeriods.find((p) => p.startDate <= date && p.endDate >= date);
    const automaticReversal =
      sourceType === "FXReversal" &&
      nextData.journals.some((j) => j.sourceType === "FXRevaluation" && j.sourceId === sourceId);
    if (!period && !automaticReversal)
      return {
        success: false,
        error: "Cadastre um período fiscal que inclua a data do lançamento.",
      };
    if (activeCompany.isPeriodClosed || period?.status === "Locked") {
      if (!userPersona.canClosePeriod) {
        return {
          success: false,
          error: `Period ${activeCompany.activePeriod} is locked. Only an Administrator with a mandatory override justification can post into a closed period.`,
        };
      }
      if (!overrideReason || overrideReason.trim().length < 5) {
        return {
          success: false,
          error: `Period ${activeCompany.activePeriod} is closed. An explicit, audited override reason is required to post adjustments.`,
        };
      }
    }

    if (!lines.length || lines.length < 2)
      return { success: false, error: "Informe pelo menos duas linhas." };
    for (const line of lines) {
      if (!currentData.accounts.some((a) => a.code === line.accountCode))
        return {
          success: false,
          error: `Cadastre a conta contábil ${line.accountCode} antes de operar.`,
        };
      if (
        !Number.isFinite(line.debit) ||
        !Number.isFinite(line.credit) ||
        line.debit < 0 ||
        line.credit < 0 ||
        (line.debit > 0 && line.credit > 0)
      )
        return { success: false, error: "Débito/crédito inválido." };
    }
    const totalDebit =
      Math.round(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) * 100) / 100;
    const totalCredit =
      Math.round(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0) * 100) / 100;

    if (totalDebit <= 0) return { success: false, error: "Informe um valor positivo." };
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      return {
        success: false,
        error: `Journal entry does not balance! Total Debits ($${totalDebit.toFixed(2)}) must equal Total Credits ($${totalCredit.toFixed(2)}). Difference: $${Math.abs(totalDebit - totalCredit).toFixed(2)}`,
      };
    }

    const entryId = `JE-${new Date().getFullYear()}-${String(nextData.journals.length + 1).padStart(4, "0")}`;
    const newEntry: JournalEntry = {
      id: entryId,
      date,
      memo,
      sourceType,
      sourceId,
      currency,
      fxRate,
      status: "Posted",
      overrideReason,
      createdBy: userPersona.name,
      createdAt: new Date().toISOString(),
      lines: lines.map((l, idx) => ({
        id: `jl-${Date.now()}-${idx}`,
        accountCode: l.accountCode,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        memo: l.memo,
        projectId: l.projectId,
      })),
    };
    newEntry.dimensionValues = lines.flatMap((l, idx) =>
      (l.dimensionValues ?? []).map((v) => ({ ...v, lineId: newEntry.lines[idx]!.id })),
    );

    updateCompanyData((prev) => ({
      ...prev,
      journals: [newEntry, ...prev.journals],
    }));

    addAuditLog(
      "POST_JOURNAL_ENTRY",
      "JournalEntry",
      entryId,
      `Posted balanced entry: ${memo} (Total: $${totalDebit.toFixed(2)})`,
      overrideReason,
    );

    return { success: true, entryId };
  };

  const reverseJournalEntry = (id: string, reason: string) => {
    if (!userPersona.canCreateJournals) {
      return { success: false, error: "Access denied." };
    }
    const target = currentData.journals.find((j) => j.id === id);
    if (!target) return { success: false, error: "Journal entry not found." };
    if (target.status === "Reversed")
      return { success: false, error: "Entry has already been reversed." };

    const reversalDate = new Date().toISOString().slice(0, 10);
    const period = currentData.fiscalPeriods.find(
      (p) => p.startDate <= reversalDate && p.endDate >= reversalDate,
    );
    if (!period || period.status !== "Open" || activeCompany.isPeriodClosed)
      return { success: false, error: "Abra um período fiscal para a data do estorno." };
    const revId = `REV-${target.id}`;
    const reversedLines: JournalLine[] = target.lines.map((l, idx) => ({
      id: `rev-jl-${Date.now()}-${idx}`,
      accountCode: l.accountCode,
      debit: l.credit,
      credit: l.debit,
      memo: `Reversal of ${target.id}: ${l.memo || target.memo}`,
      projectId: l.projectId,
    }));

    const revEntry: JournalEntry = {
      id: revId,
      date: new Date().toISOString().split("T")[0]!,
      memo: `Reversal of ${target.id}: ${reason}`,
      sourceType: "Manual",
      sourceId: target.id,
      currency: target.currency,
      fxRate: target.fxRate,
      status: "Posted",
      createdBy: userPersona.name,
      createdAt: new Date().toISOString(),
      lines: reversedLines,
      dimensionValues: (target.dimensionValues ?? []).map((v) => ({
        ...v,
        lineId: reversedLines[target.lines.findIndex((l) => l.id === v.lineId)]?.id,
      })),
    };

    updateCompanyData((prev) => ({
      ...prev,
      journals: prev.journals
        .map((j) => (j.id === id ? { ...j, status: "Reversed" as const } : j))
        .concat(revEntry),
    }));

    addAuditLog(
      "REVERSE_JOURNAL_ENTRY",
      "JournalEntry",
      target.id,
      `Reversed entry with counter-entry ${revId}. Reason: ${reason}`,
    );

    return { success: true };
  };

  const togglePeriodLock = (reason?: string | undefined) => {
    if (!userPersona.canClosePeriod) {
      return {
        success: false,
        error: "Access Denied: Only an Administrator can lock or unlock accounting periods.",
      };
    }
    const newStatus = !activeCompany.isPeriodClosed;
    setCompanies((prev) =>
      prev.map((c) => (c.id === activeCompany.id ? { ...c, isPeriodClosed: newStatus } : c)),
    );
    addAuditLog(
      newStatus ? "LOCK_PERIOD" : "UNLOCK_PERIOD",
      "AccountingPeriod",
      activeCompany.activePeriod,
      `Accounting period ${activeCompany.activePeriod} was marked as ${newStatus ? "CLOSED & LOCKED" : "OPEN"}.`,
      reason,
    );
    return { success: true };
  };

  const createInvoice: AccountingContextType["createInvoice"] = (invData) => {
    if (!userPersona.canCreateJournals) {
      return { success: false, error: "Unauthorized." };
    }
    const invId = `INV-${new Date().getFullYear().toString().substr(2)}${String(currentData.invoices.length + 1).padStart(3, "0")}`;
    const customer = currentData.customers.find((c) => c.id === invData.customerId);
    if (!customer || customer.registrationStatus === "Draft")
      return {
        success: false,
        error:
          "Select an active customer. Complete draft customer billing details before invoicing.",
      };
    const issueFx = normalizedFx(invData);
    if (invData.customerId && !currentData.customers.some((c) => c.id === invData.customerId))
      throw new Error("Select a customer belonging to this company.");
    const newInvoice: Invoice = {
      ...invData,
      customerName: customer.displayName,
      ...issueFx,
      payments: [],
      exchangeRateSource: invData.exchangeRateSource || "Manual",
      exchangeRateDate: invData.exchangeRateDate || invData.date,
      id: invId,
      status: "Open",
    };
    validateDimensionValues(
      currentData.dimensions,
      invData.dimensionValues,
      invData.items.map((i) => i.id),
      "invoices",
      true,
    );
    for (const item of invData.items)
      requireDimensions(
        currentData.dimensions,
        effectiveDimensions(invData.dimensionValues, item.id),
        "invoices",
      );

    let totalCogsToRelieve = 0;
    const cogsByLine = new Map<string, number>();
    const updatedInventory = currentData.inventory.map((item) => {
      const matching = invData.items.filter((i) => i.sku === item.sku && i.isProduct);
      const line = matching.length
        ? { ...matching[0]!, qty: matching.reduce((sum, i) => sum + i.qty, 0) }
        : undefined;
      if (line && line.qty > item.qtyOnHand)
        throw new Error(`Estoque insuficiente para ${item.sku}.`);
      if (!line || line.qty <= 0) return item;

      let neededQty = line.qty;
      let lineCogs = 0;

      if (activeCompany.costMethod === "FIFO" && item.costLots.length > 0) {
        const remainingLots: typeof item.costLots = [];
        const consumedLots: { qty: number; unitCost: number }[] = [];
        for (const lot of item.costLots) {
          if (neededQty <= 0) {
            remainingLots.push(lot);
          } else if (lot.qty <= neededQty) {
            consumedLots.push({ qty: lot.qty, unitCost: lot.unitCost });
            neededQty -= lot.qty;
            lineCogs += lot.qty * lot.unitCost;
          } else {
            consumedLots.push({ qty: neededQty, unitCost: lot.unitCost });
            lineCogs += neededQty * lot.unitCost;
            remainingLots.push({ ...lot, qty: lot.qty - neededQty });
            neededQty = 0;
          }
        }
        totalCogsToRelieve += lineCogs;
        for (const invoiceLine of matching) {
          let quantity = invoiceLine.qty,
            cost = 0;
          for (const lot of consumedLots) {
            const consumed = Math.min(quantity, lot.qty);
            cost += consumed * lot.unitCost;
            lot.qty -= consumed;
            quantity -= consumed;
            if (quantity <= 0) break;
          }
          cogsByLine.set(invoiceLine.id, cost);
        }
        return {
          ...item,
          qtyOnHand: Math.max(0, item.qtyOnHand - line.qty),
          costLots: remainingLots,
        };
      } else {
        const cogsAmount = line.qty * item.unitCost;
        totalCogsToRelieve += cogsAmount;
        for (const invoiceLine of matching)
          cogsByLine.set(invoiceLine.id, invoiceLine.qty * item.unitCost);
        return {
          ...item,
          qtyOnHand: Math.max(0, item.qtyOnHand - line.qty),
        };
      }
    });

    const jeLines: {
      accountCode: string;
      debit: number;
      credit: number;
      memo?: string | undefined;
      projectId?: string | undefined;
      dimensionValues?: DimensionValue[] | undefined;
    }[] = [];

    jeLines.push({
      accountCode: resolveAccount(currentData.accounts, "11000", "1100"),
      debit: issueFx.functionalAmount,
      credit: 0,
      memo: `AR — ${newInvoice.customerName}`,
      projectId: newInvoice.projectId,
    });

    let revenueAllocated = 0;
    newInvoice.items.forEach((item, index) => {
      const amount =
        index === newInvoice.items.length - 1
          ? money(money(newInvoice.subtotal * issueFx.exchangeRateValue) - revenueAllocated)
          : money(item.qty * item.unitPrice * issueFx.exchangeRateValue);
      revenueAllocated += amount;
      jeLines.push({
        accountCode: item.isProduct
          ? resolveAccount(currentData.accounts, "40100", "4100")
          : resolveAccount(currentData.accounts, "40200", "4000"),
        debit: 0,
        credit: amount,
        memo: item.description,
        projectId: newInvoice.projectId,
        dimensionValues: effectiveDimensions(newInvoice.dimensionValues, item.id),
      });
    });

    if (newInvoice.taxAmount > 0) {
      jeLines.push({
        accountCode: resolveAccount(currentData.accounts, "22100", "2200"),
        debit: 0,
        credit: money(
          issueFx.functionalAmount - money(newInvoice.subtotal * issueFx.exchangeRateValue),
        ),
        memo: `Sales tax collected (${newInvoice.taxRate}%) on ${invId}`,
      });
    }

    if (totalCogsToRelieve > 0) {
      const roundedCogs = Math.round(totalCogsToRelieve * 100) / 100;
      const costItems = newInvoice.items.filter((i) => i.isProduct && cogsByLine.has(i.id));
      let costAllocated = 0;
      costItems.forEach((item, index) => {
        const cost = cogsByLine.get(item.id)!;
        const amount =
          index === costItems.length - 1
            ? Math.round((roundedCogs - costAllocated) * 100) / 100
            : Math.round(cost * 100) / 100;
        costAllocated += amount;
        jeLines.push({
          accountCode: resolveAccount(currentData.accounts, "50100", "5000"),
          debit: amount,
          credit: 0,
          memo: `COGS — ${item.description}`,
          projectId: newInvoice.projectId,
          dimensionValues: effectiveDimensions(newInvoice.dimensionValues, item.id),
        });
      });
      jeLines.push({
        accountCode: resolveAccount(currentData.accounts, "13000", "1300"),
        debit: 0,
        credit: roundedCogs,
        memo: `Inventory reduction for ${invId}`,
      });
    }

    const postResult = postJournalEntry({
      date: newInvoice.date,
      memo: `Invoice ${invId} — ${newInvoice.customerName} (${newInvoice.kind})`,
      sourceType: "Invoice",
      sourceId: invId,
      currency: issueFx.transactionCurrency,
      fxRate: issueFx.exchangeRateValue,
      lines: jeLines,
    });

    if (!postResult.success) {
      return postResult;
    }

    updateCompanyData((prev) => ({
      ...prev,
      invoices: [newInvoice, ...prev.invoices],
      inventory: updatedInventory,
    }));

    addAuditLog(
      "CREATE_INVOICE",
      "Invoice",
      invId,
      `Issued ${newInvoice.kind} Invoice to ${newInvoice.customerName}. Subtotal: $${newInvoice.subtotal.toFixed(2)}, Tax: $${newInvoice.taxAmount.toFixed(2)}, Total: $${newInvoice.total.toFixed(2)}.`,
    );

    return { success: true, invoiceId: invId };
  };

  const settleDocument = (
    kind: "AP" | "AR",
    id: string,
    paymentDate: string,
    rate?: number,
    requestedAmount?: number,
    bankAccountId?: string,
    quote?: { source: string; date: string },
  ) => {
    const doc =
      kind === "AP"
        ? nextData.bills.find((b) => b.id === id)
        : nextData.invoices.find((i) => i.id === id);
    if (!doc) return { success: false, error: "Document not found." };
    const fx = normalizedFx(doc),
      open = outstanding(doc);
    if (!open.native) return { success: false, error: "Document is already paid." };
    if (
      nextData.journals.some(
        (j) =>
          j.sourceType === "FXRevaluation" &&
          j.sourceId?.startsWith(kind + ":" + id + ":") &&
          j.date >= paymentDate,
      )
    )
      return {
        success: false,
        error:
          "This document has been revalued. Record settlement after its latest revaluation date.",
      };
    if (fx.transactionCurrency !== "USD" && rate == null)
      return { success: false, error: "Enter the payment date exchange rate." };
    const appliedRate = rate ?? 1,
      amount = requestedAmount ?? open.native;
    if (quote?.date && quote.date > paymentDate)
      return { success: false, error: "The quote date cannot be after the payment date." };
    if (bankAccountId && kind === "AP") {
      const bank = nextData.vendors
        .find((v) => v.id === (doc as Bill).vendorId)
        ?.bankAccounts?.find((b) => b.id === bankAccountId);
      if (!bank || bank.currency !== fx.transactionCurrency)
        return {
          success: false,
          error: "Select a bank account of this vendor in the payment currency.",
        };
    }
    let result: ReturnType<typeof settlement>;
    try {
      result = settlement(doc, kind, amount, appliedRate, paymentDate);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Invalid payment" };
    }
    const control = resolveAccount(
      nextData.accounts,
      kind === "AP" ? "20100" : "11000",
      kind === "AP" ? "2000" : "1100",
    );
    const cash = resolveAccount(nextData.accounts, "10200", "1000");
    const lines = [
      {
        accountCode: control,
        debit: kind === "AP" ? result.bookAmount : 0,
        credit: kind === "AR" ? result.bookAmount : 0,
        memo: "Clear historical carrying amount " + id,
      },
      {
        accountCode: cash,
        debit: kind === "AR" ? result.functionalAmount : 0,
        credit: kind === "AP" ? result.functionalAmount : 0,
        memo: "Settlement " + fx.transactionCurrency + " " + amount,
      },
    ];
    if (result.realizedGain)
      lines.push({
        accountCode: resolveAccount(nextData.accounts, "80300", "6300"),
        debit: Math.max(0, -result.realizedGain),
        credit: Math.max(0, result.realizedGain),
        memo: "Realized FX " + id,
      });
    const post = postJournalEntry({
      date: paymentDate,
      memo: "Settlement " + id,
      sourceType: "Payment",
      sourceId: id,
      currency: fx.transactionCurrency,
      fxRate: appliedRate,
      lines,
    });
    if (!post.success) return post;
    const payment: Payment = {
      id: crypto.randomUUID(),
      date: paymentDate,
      ...fx,
      transactionAmount: money(amount),
      exchangeRateValue: appliedRate,
      functionalAmount: result.functionalAmount,
      bookAmount: result.bookAmount,
      realizedGain: result.realizedGain,
      bankAccountId,
      journalId: post.entryId!,
      exchangeRateSource: quote?.source || "Payment rate / manual",
      exchangeRateDate: quote?.date || paymentDate,
    };
    const updated = {
      ...doc,
      payments: [...(doc.payments || []), payment],
      status: result.remaining === 0 ? ("Paid" as const) : ("Partially Paid" as const),
      paymentDate,
      paidFxRate: appliedRate,
      realizedFxDiff: money(((doc as Bill).realizedFxDiff || 0) + result.realizedGain),
    };
    updateCompanyData((prev) =>
      kind === "AP"
        ? { ...prev, bills: prev.bills.map((b) => (b.id === id ? (updated as Bill) : b)) }
        : { ...prev, invoices: prev.invoices.map((i) => (i.id === id ? (updated as Invoice) : i)) },
    );
    addAuditLog(
      "SETTLE_" + kind,
      kind === "AP" ? "Bill" : "Invoice",
      id,
      "Paid " +
        amount +
        " " +
        fx.transactionCurrency +
        "; realized gain " +
        result.realizedGain +
        " USD",
    );
    return { success: true };
  };
  const recordInvoicePayment = (
    id: string,
    date: string,
    rate?: number,
    amount?: number,
    quote?: { source: string; date: string },
  ) => settleDocument("AR", id, date, rate, amount, undefined, quote);

  const saveVendor = (input: VendorInput, id?: string) => {
    if (!userPersona.canCreateJournals) throw new Error("Acesso negado.");
    const data = vendorSchema.parse(input);
    if (id && !nextData.vendors.some((v) => v.id === id))
      throw new Error("Fornecedor não encontrado.");
    const vendorId = id ?? crypto.randomUUID();
    updateCompanyData((prev) => ({
      ...prev,
      vendors: id
        ? prev.vendors.map((v) => (v.id === id ? { ...data, id } : v))
        : [...prev.vendors, { ...data, id: vendorId }],
    }));
    addAuditLog(
      id ? "Update Vendor" : "Create Vendor",
      "Vendor",
      vendorId,
      "Cadastro do fornecedor atualizado.",
    );
    return vendorId;
  };
  const addVendor = (input: VendorInput) => saveVendor(input);
  const updateVendor = (id: string, input: VendorInput) => {
    saveVendor(input, id);
  };
  const deleteVendor = (id: string) => {
    if (!userPersona.canCreateJournals) throw new Error("Access denied.");
    const vendor = currentData.vendors.find((v) => v.id === id);
    if (!vendor) throw new Error("Vendor not found.");
    const links = vendorLinks(currentData, vendor);
    if (links.length)
      throw new Error(`This vendor is linked to ${links.join(", ")} and cannot be deleted.`);
    updateCompanyData((prev) => ({ ...prev, vendors: prev.vendors.filter((v) => v.id !== id) }));
    addAuditLog("Delete Vendor", "Vendor", id, `Deleted unused vendor ${vendor.displayName}.`);
  };
  const deleteCustomer = (id: string) => {
    if (!userPersona.canCreateJournals) throw new Error("Access denied.");
    const customer = currentData.customers.find((c) => c.id === id);
    if (!customer) throw new Error("Customer not found.");
    const links = customerLinks(currentData, customer);
    if (links.length)
      throw new Error(`This customer is linked to ${links.join(", ")} and cannot be deleted.`);
    updateCompanyData((prev) => ({
      ...prev,
      customers: prev.customers.filter((c) => c.id !== id),
    }));
    addAuditLog(
      "Delete Customer",
      "Customer",
      id,
      `Deleted unused customer ${customer.displayName}.`,
    );
  };

  const createBill: AccountingContextType["createBill"] = (billData) => {
    if (!userPersona.canCreateJournals) return { success: false, error: "Unauthorized." };
    validateDimensionValues(
      currentData.dimensions,
      billData.dimensionValues,
      billData.items.map((i) => i.id),
      "bills",
      true,
    );
    for (const item of billData.items) {
      const account = currentData.accounts.find((a) => a.code === item.accountCode);
      if (account && isProfitLoss(account.type))
        requireDimensions(
          currentData.dimensions,
          effectiveDimensions(billData.dimensionValues, item.id),
          "bills",
        );
    }

    const vendor = currentData.vendors.find((v) => v.id === billData.vendorId);
    if (!vendor) return { success: false, error: "Select a registered vendor." };
    const billId = `BILL-${new Date().getFullYear().toString().substr(2)}${String(currentData.bills.length + 1).padStart(3, "0")}`;
    const issueFx = normalizedFx(billData);
    const usdAmount = issueFx.functionalAmount;
    if (
      Math.abs(money(billData.items.reduce((sum, item) => sum + item.amount, 0)) - usdAmount) >
      0.005
    )
      return { success: false, error: "Bill line amounts must equal its functional amount." };
    let allocated = 0;
    const functionalItems = billData.items.map((item, index) => {
      const amount =
        index === billData.items.length - 1 ? money(usdAmount - allocated) : money(item.amount);
      allocated = money(allocated + amount);
      return { ...item, amount };
    });

    const newBill: Bill = {
      ...billData,
      items: functionalItems,
      vendorName: vendor.displayName,
      ...issueFx,
      currency: issueFx.transactionCurrency,
      fxRate: issueFx.exchangeRateValue,
      foreignAmount: issueFx.transactionAmount,
      payments: [],
      exchangeRateSource: billData.exchangeRateSource || "Manual",
      exchangeRateDate: billData.exchangeRateDate || billData.date,
      id: billId,
      usdAmount,
      status: "Open",
    };

    const jeLines: {
      accountCode: string;
      debit: number;
      credit: number;
      memo?: string | undefined;
      projectId?: string | undefined;
      dimensionValues?: DimensionValue[] | undefined;
    }[] = [];

    newBill.items.forEach((item) => {
      jeLines.push({
        accountCode: item.accountCode,
        debit: item.amount,
        credit: 0,
        memo: item.description,
        projectId: item.projectId || newBill.projectId,
        dimensionValues: isProfitLoss(
          currentData.accounts.find((a) => a.code === item.accountCode)?.type ?? "",
        )
          ? effectiveDimensions(newBill.dimensionValues, item.id)
          : [],
      });
    });

    jeLines.push({
      accountCode: resolveAccount(currentData.accounts, "20100", "2000"),
      debit: 0,
      credit: usdAmount,
      memo: `AP to ${newBill.vendorName} (Ref: ${newBill.billNumber})`,
      projectId: newBill.projectId,
    });

    const postResult = postJournalEntry({
      date: newBill.date,
      memo: `Vendor Bill ${billId} (${newBill.vendorName}) — ${newBill.currency} ${newBill.foreignAmount.toLocaleString()}`,
      sourceType: "Bill",
      sourceId: billId,
      currency: newBill.currency,
      fxRate: newBill.fxRate,
      lines: jeLines,
    });

    if (!postResult.success) return postResult;

    let nextInv = currentData.inventory;
    const invItem = newBill.items.find((i) => i.isInventory && i.sku);
    if (invItem && invItem.sku && invItem.qty && invItem.qty > 0) {
      const unitCost = invItem.amount / invItem.qty;
      nextInv = nextInv.map((it) => {
        if (it.sku === invItem.sku) {
          const newQty = it.qtyOnHand + invItem.qty!;
          const newAvgCost = (it.qtyOnHand * it.unitCost + invItem.amount) / newQty;
          return {
            ...it,
            qtyOnHand: newQty,
            unitCost: activeCompany.costMethod === "WeightedAverage" ? newAvgCost : it.unitCost,
            costLots: [
              ...it.costLots,
              { id: `lot-${Date.now()}`, qty: invItem.qty!, unitCost, date: newBill.date },
            ],
          };
        }
        return it;
      });
    }

    updateCompanyData((prev) => ({
      ...prev,
      bills: [newBill, ...prev.bills],
      inventory: nextInv,
    }));

    addAuditLog(
      "CREATE_BILL",
      "Bill",
      billId,
      `Entered vendor bill from ${newBill.vendorName}. USD Base: $${usdAmount.toFixed(2)}.`,
    );

    return { success: true, billId };
  };

  const payBill = (
    id: string,
    date: string,
    rate?: number,
    amount?: number,
    bankId?: string,
    quote?: { source: string; date: string },
  ) => settleDocument("AP", id, date, rate, amount, bankId, quote);
  const revalueOpenItems: AccountingContextType["revalueOpenItems"] = (asOf, rates) => {
    if (asOf > new Date().toISOString().slice(0, 10))
      return { success: false, error: "A closing revaluation cannot be dated in the future." };
    if (!userPersona.canClosePeriod)
      return { success: false, error: "Closing permission is required." };
    if (!nextDay(asOf).endsWith("-01"))
      return { success: false, error: "Select the last day of a month." };
    let count = 0;
    for (const kind of ["AP", "AR"] as const)
      for (const doc of kind === "AP" ? nextData.bills : nextData.invoices) {
        const fx = normalizedFx(doc),
          open = outstanding(doc, asOf),
          sourceId = kind + ":" + doc.id + ":" + asOf;
        if (
          !open.native ||
          fx.transactionCurrency === "USD" ||
          nextData.journals.some((j) => j.sourceType === "FXRevaluation" && j.sourceId === sourceId)
        )
          continue;
        const quote = rates[fx.transactionCurrency];
        if (!quote || quote.date > asOf)
          return { success: false, error: "Missing closing spot rate: " + fx.transactionCurrency };
        const adjustment = closingAdjustment(doc, kind, asOf, quote.rate);
        if (!adjustment.difference) continue;
        const gain = adjustment.gain,
          control = resolveAccount(
            nextData.accounts,
            kind === "AP" ? "20100" : "11000",
            kind === "AP" ? "2000" : "1100",
          );
        const lines = [
          {
            accountCode: control,
            debit: Math.max(0, gain),
            credit: Math.max(0, -gain),
            memo: "Closing revaluation " + doc.id,
          },
          {
            accountCode: resolveAccount(nextData.accounts, "80300", "6300"),
            debit: Math.max(0, -gain),
            credit: Math.max(0, gain),
            memo: "Unrealized FX " + doc.id,
          },
        ];
        const post = postJournalEntry({
          date: asOf,
          memo:
            "FX revaluation " +
            doc.id +
            " / " +
            quote.source +
            " / " +
            quote.date +
            " / rate " +
            quote.rate,
          sourceType: "FXRevaluation",
          sourceId,
          currency: fx.transactionCurrency,
          fxRate: quote.rate,
          lines,
        });
        if (!post.success) return post;
        const reverse = postJournalEntry({
          date: nextDay(asOf),
          memo: "Automatic reversal of " + post.entryId,
          sourceType: "FXReversal",
          sourceId,
          currency: fx.transactionCurrency,
          fxRate: quote.rate,
          lines: lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
        });
        if (!reverse.success) return reverse;
        count++;
      }
    addAuditLog(
      "REVALUE_OPEN_ITEMS",
      "AccountingPeriod",
      asOf,
      "Revalued " + count + " documents with automatic next-day reversing journals.",
    );
    return { success: true, count };
  };

  const createProject = (projData: Omit<Project, "id">) => {
    const newProj: Project = {
      ...projData,
      id: `proj-${Date.now()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      projects: [newProj, ...prev.projects],
    }));
    addAuditLog(
      "CREATE_PROJECT",
      "Project",
      newProj.code,
      `Created project "${newProj.name}" with budget $${newProj.budget.toLocaleString()}.`,
    );
  };

  const adjustStock = (itemId: string, qtyDelta: number, unitCost: number, memo: string) => {
    const item = currentData.inventory.find((i) => i.id === itemId);
    if (!item) return;

    const adjustmentValue = Math.round(Math.abs(qtyDelta) * unitCost * 100) / 100;
    const isIncrease = qtyDelta > 0;

    const jeLines = [
      {
        accountCode: resolveAccount(currentData.accounts, "13000", "1300"),
        debit: isIncrease ? adjustmentValue : 0,
        credit: isIncrease ? 0 : adjustmentValue,
        memo: `Inventory adjustment for ${item.sku}: ${memo}`,
      },
      {
        accountCode: resolveAccount(currentData.accounts, "50100", "5000"),
        debit: isIncrease ? 0 : adjustmentValue,
        credit: isIncrease ? adjustmentValue : 0,
        memo: `COGS offset for ${item.sku} count variance`,
      },
    ];

    const posting = postJournalEntry({
      date: new Date().toISOString().split("T")[0]!,
      memo: `Physical Inventory Count Adjustment — ${item.sku}`,
      sourceType: "InventoryAdjustment",
      lines: jeLines,
    });
    if (!posting.success) throw new Error(posting.error);

    updateCompanyData((prev) => ({
      ...prev,
      inventory: prev.inventory.map((i) =>
        i.id === itemId
          ? {
              ...i,
              qtyOnHand: Math.max(0, i.qtyOnHand + qtyDelta),
              costLots: isIncrease
                ? [
                    ...i.costLots,
                    {
                      id: `lot-${Date.now()}`,
                      qty: qtyDelta,
                      unitCost,
                      date: new Date().toISOString().split("T")[0]!,
                    },
                  ]
                : i.costLots,
            }
          : i,
      ),
    }));

    addAuditLog(
      "ADJUST_STOCK",
      "InventoryItem",
      item.sku,
      `Adjusted stock by ${qtyDelta > 0 ? "+" : ""}${qtyDelta} units. Memo: ${memo}`,
    );
  };

  const addInventoryItem = (itemData: Omit<InventoryItem, "id" | "costLots">) => {
    const newItem: InventoryItem = {
      ...itemData,
      id: `item-${Date.now()}`,
      costLots:
        itemData.qtyOnHand > 0
          ? [
              {
                id: `lot-init-${Date.now()}`,
                qty: itemData.qtyOnHand,
                unitCost: itemData.unitCost,
                date: new Date().toISOString().split("T")[0]!,
              },
            ]
          : [],
    };
    updateCompanyData((prev) => ({
      ...prev,
      inventory: [...prev.inventory, newItem],
    }));
    addAuditLog(
      "CREATE_ITEM",
      "InventoryItem",
      newItem.sku,
      `Added item ${newItem.sku} (${newItem.name}) to catalog.`,
    );
  };

  const setCostMethod = (method: "FIFO" | "WeightedAverage") => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === activeCompany.id ? { ...c, costMethod: method } : c)),
    );
    addAuditLog(
      "UPDATE_COST_METHOD",
      "ClientCompany",
      activeCompany.id,
      `Valuation method updated to ${method}.`,
    );
  };

  const importStatement = ({
    name,
    accountCode,
    content,
  }: {
    name: string;
    type: "CSV" | "OFX" | "PDF";
    accountCode: string;
    content: string;
  }) => {
    const parsed = parseStatementCsv(content);
    if (!currentData.accounts.some((a) => a.code === accountCode))
      throw new Error("Cadastre e selecione a conta bancária no plano de contas.");
    const fileId = crypto.randomUUID();
    const newFile: BankStatementFile = {
      id: fileId,
      fileName: name,
      fileType: "CSV",
      accountCode,
      rowsCount: parsed.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userPersona.name,
      status: "Pending Review",
      content,
    };
    updateCompanyData((prev) => ({
      ...prev,
      statements: [newFile, ...prev.statements],
      stagingRows: [
        ...parsed.map((row) => ({
          ...row,
          id: crypto.randomUUID(),
          fileId,
          suggestedAccount: "",
          status: "Pending" as const,
        })),
        ...prev.stagingRows,
      ],
    }));
    addAuditLog("IMPORT_STATEMENT", "BankStatementFile", fileId, "Imported CSV: " + name);
  };

  const classifyStagingRow = (rowId: string, targetAccountCode: string) => {
    const row = currentData.stagingRows.find((r) => r.id === rowId);
    if (!row || row.status !== "Pending") throw new Error("Linha indisponível para classificação.");

    if (targetAccountCode === currentData.statements.find((s) => s.id === row.fileId)?.accountCode)
      throw new Error("Selecione uma contrapartida diferente da conta bancária.");
    const isOutflow = row.amount < 0;
    const absAmount = Math.abs(row.amount);
    const jeLines = [
      {
        accountCode: targetAccountCode,
        debit: isOutflow ? absAmount : 0,
        credit: isOutflow ? 0 : absAmount,
        memo: row.description,
      },
      {
        accountCode: currentData.statements.find((s) => s.id === row.fileId)!.accountCode,
        debit: isOutflow ? 0 : absAmount,
        credit: isOutflow ? absAmount : 0,
        memo: `Bank statement feed: ${row.description}`,
      },
    ];

    const posting = postJournalEntry({
      date: row.date,
      memo: `Bank feed classification: ${row.description}`,
      sourceType: "BankStaging",
      lines: jeLines,
    });
    if (!posting.success) throw new Error(posting.error);

    updateCompanyData((prev) => ({
      ...prev,
      stagingRows: prev.stagingRows.map((r) =>
        r.id === rowId
          ? { ...r, status: "Classified" as const, classifiedAccount: targetAccountCode }
          : r,
      ),
    }));

    addAuditLog(
      "CLASSIFY_STAGING",
      "StagingRow",
      rowId,
      `Classified staged bank transaction to Account ${targetAccountCode}.`,
    );
  };

  const recordTaxRemittance = (taxId: string, receiptName: string) => {
    const tax = currentData.taxes.find((t) => t.id === taxId);
    if (!tax) return;

    const jeLines = [
      {
        accountCode: resolveAccount(currentData.accounts, "22100", "2200"),
        debit: tax.dueAmount,
        credit: 0,
        memo: `Tax remittance: ${tax.jurisdiction}`,
      },
      {
        accountCode: resolveAccount(currentData.accounts, "10200", "1000"),
        debit: 0,
        credit: tax.dueAmount,
        memo: `Payment of ${tax.period} sales tax`,
      },
    ];

    const posting = postJournalEntry({
      date: new Date().toISOString().split("T")[0]!,
      memo: `Sales Tax Remittance — ${tax.jurisdiction} (${tax.period})`,
      sourceType: "Payment",
      lines: jeLines,
    });
    if (!posting.success) throw new Error(posting.error);

    updateCompanyData((prev) => ({
      ...prev,
      taxes: prev.taxes.map((t) =>
        t.id === taxId
          ? {
              ...t,
              status: "Paid" as const,
              receiptFileName: receiptName,
              paidAt: new Date().toISOString().split("T")[0]!,
            }
          : t,
      ),
    }));

    addAuditLog(
      "REMIT_TAX",
      "TaxRecord",
      taxId,
      `Remitted sales tax payment of $${tax.dueAmount.toFixed(2)} with receipt attachment ${receiptName}.`,
    );
  };

  const installUsGaapCoa = () => {
    if (currentData.accounts.length)
      throw new Error(
        "Install the template only in an empty chart to preserve existing account mappings.",
      );
    updateCompanyData((prev) => ({ ...prev, accounts: structuredClone(US_GAAP_COA) }));
    addAuditLog(
      "INSTALL_COA",
      "Account",
      "US-GAAP",
      "Installed the five-digit company CoA template.",
    );
  };
  const addAccount = (acct: Account) => {
    validateCoa([...currentData.accounts, acct]);
    if (currentData.accounts.some((a) => a.code.toLowerCase() === acct.code.toLowerCase()))
      throw new Error("An account with this code already exists for this company.");
    updateCompanyData((prev) => ({
      ...prev,
      accounts: [...prev.accounts, acct],
    }));
    addAuditLog(
      "CREATE_ACCOUNT",
      "Account",
      acct.code,
      `Added account ${acct.code} — ${acct.name} (${acct.type}).`,
    );
  };

  const updateAccount = (code: string, data: Omit<Account, "code">) => {
    validateCoa(currentData.accounts.map((a) => (a.code === code ? { ...data, code } : a)));
    const existing = currentData.accounts.find((a) => a.code === code);
    if (!existing) throw new Error("Account not found for this company.");
    if (
      currentData.journals.some((j) => j.lines.some((l) => l.accountCode === code)) &&
      (existing.type !== data.type || existing.balanceType !== data.balanceType)
    )
      throw new Error(
        "Accounts with journal entries cannot change classification or normal balance. Create a new account.",
      );
    updateCompanyData((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) => (a.code === code ? { ...data, code } : a)),
    }));
    addAuditLog("UPDATE_ACCOUNT", "Account", code, `Updated account ${code} — ${data.name}.`);
  };

  const deleteAccount = (code: string) => {
    if (!currentData.accounts.some((a) => a.code === code))
      throw new Error("Account not found for this company.");
    const used =
      currentData.accounts.some((a) => a.parentCode === code) ||
      currentData.journals.some((j) => j.lines.some((l) => l.accountCode === code)) ||
      currentData.bills.some((b) => b.items.some((l) => l.accountCode === code)) ||
      currentData.statements.some((s) => s.accountCode === code) ||
      currentData.stagingRows.some((s) => s.classifiedAccount === code) ||
      [...currentData.expenseCategories, ...currentData.taxJurisdictions].some(
        (p) => p.glAccountCode === code,
      );
    if (used)
      throw new Error("This account has journal entries or linked records and cannot be deleted.");
    updateCompanyData((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((a) => a.code !== code),
    }));
    addAuditLog("DELETE_ACCOUNT", "Account", code, `Deleted unused account ${code}.`);
  };

  // --- CRUD de Parâmetros ---

  // Moedas (Currencies)
  const addCurrency = (curr: CurrencyParam) => {
    updateCompanyData((prev) => ({
      ...prev,
      currencies: [...(prev.currencies || []).filter((c) => c.code !== curr.code), curr],
    }));
    addAuditLog(
      "CREATE_CURRENCY",
      "CurrencyParam",
      curr.code,
      `Adicionada moeda ${curr.code} (${curr.name}) com taxa de ${curr.exchangeRateToUsd}.`,
    );
  };

  const updateCurrency = (code: string, data: Partial<CurrencyParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      currencies: (prev.currencies || []).map((c) =>
        c.code === code
          ? { ...c, ...data, lastUpdated: new Date().toISOString().split("T")[0]! }
          : c,
      ),
    }));
    addAuditLog(
      "UPDATE_CURRENCY",
      "CurrencyParam",
      code,
      `Atualizados parâmetros da moeda ${code}.`,
    );
  };

  const deleteCurrency = (code: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      currencies: (prev.currencies || []).filter((c) => c.code !== code),
    }));
    addAuditLog(
      "DELETE_CURRENCY",
      "CurrencyParam",
      code,
      `Removida moeda ${code} do catálogo de taxas.`,
    );
  };

  // Jurisdições Fiscais (Tax Jurisdictions)
  const addTaxJurisdiction = (tax: Omit<TaxJurisdictionParam, "id">) => {
    const newTax: TaxJurisdictionParam = {
      ...tax,
      id: `tax-jur-${crypto.randomUUID()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      taxJurisdictions: [...(prev.taxJurisdictions || []), newTax],
    }));
    addAuditLog(
      "CREATE_TAX_JURISDICTION",
      "TaxJurisdictionParam",
      newTax.code,
      `Cadastrada jurisdição fiscal ${newTax.name} (${newTax.rate}%).`,
    );
  };

  const updateTaxJurisdiction = (id: string, data: Partial<TaxJurisdictionParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      taxJurisdictions: (prev.taxJurisdictions || []).map((t) =>
        t.id === id ? { ...t, ...data } : t,
      ),
    }));
    addAuditLog(
      "UPDATE_TAX_JURISDICTION",
      "TaxJurisdictionParam",
      id,
      `Atualizada jurisdição fiscal ${id}.`,
    );
  };

  const deleteTaxJurisdiction = (id: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      taxJurisdictions: (prev.taxJurisdictions || []).filter((t) => t.id !== id),
    }));
    addAuditLog(
      "DELETE_TAX_JURISDICTION",
      "TaxJurisdictionParam",
      id,
      `Removida jurisdição fiscal ${id}.`,
    );
  };

  // Prazos e Condições Comerciais (Payment Terms)
  const addPaymentTerm = (term: Omit<PaymentTermParam, "id">) => {
    const newTerm: PaymentTermParam = {
      ...term,
      id: `term-${crypto.randomUUID()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      paymentTerms: [...(prev.paymentTerms || []), newTerm],
    }));
    addAuditLog(
      "CREATE_PAYMENT_TERM",
      "PaymentTermParam",
      newTerm.code,
      `Cadastrada condição comercial ${newTerm.name} (${newTerm.days} dias).`,
    );
  };

  const updatePaymentTerm = (id: string, data: Partial<PaymentTermParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      paymentTerms: (prev.paymentTerms || []).map((p) => (p.id === id ? { ...p, ...data } : p)),
    }));
    addAuditLog(
      "UPDATE_PAYMENT_TERM",
      "PaymentTermParam",
      id,
      `Atualizada condição de pagamento ${id}.`,
    );
  };

  const deletePaymentTerm = (id: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      paymentTerms: (prev.paymentTerms || []).filter((p) => p.id !== id),
    }));
    addAuditLog(
      "DELETE_PAYMENT_TERM",
      "PaymentTermParam",
      id,
      `Removida condição comercial ${id}.`,
    );
  };

  // Centros de Custo (Cost Centers)
  const addCostCenter = (cc: Omit<CostCenterParam, "id">) => {
    const newCC: CostCenterParam = {
      ...cc,
      id: `cc-${crypto.randomUUID()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      costCenters: [...(prev.costCenters || []), newCC],
    }));
    addAuditLog(
      "CREATE_COST_CENTER",
      "CostCenterParam",
      newCC.code,
      `Cadastrado centro de custo ${newCC.code} - ${newCC.name}.`,
    );
  };

  const updateCostCenter = (id: string, data: Partial<CostCenterParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      costCenters: (prev.costCenters || []).map((c) => (c.id === id ? { ...c, ...data } : c)),
    }));
    addAuditLog("UPDATE_COST_CENTER", "CostCenterParam", id, `Atualizado centro de custo ${id}.`);
  };

  const deleteCostCenter = (id: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      costCenters: (prev.costCenters || []).filter((c) => c.id !== id),
    }));
    addAuditLog("DELETE_COST_CENTER", "CostCenterParam", id, `Removido centro de custo ${id}.`);
  };

  // Categorias de Despesas (Expense Categories)
  const addExpenseCategory = (cat: Omit<ExpenseCategoryParam, "id">) => {
    const newCat: ExpenseCategoryParam = {
      ...cat,
      id: `exp-cat-${crypto.randomUUID()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      expenseCategories: [...(prev.expenseCategories || []), newCat],
    }));
    addAuditLog(
      "CREATE_EXPENSE_CAT",
      "ExpenseCategoryParam",
      newCat.code,
      `Cadastrada categoria de despesa ${newCat.name} (Conta ${newCat.glAccountCode}).`,
    );
  };

  const updateExpenseCategory = (id: string, data: Partial<ExpenseCategoryParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      expenseCategories: (prev.expenseCategories || []).map((e) =>
        e.id === id ? { ...e, ...data } : e,
      ),
    }));
    addAuditLog(
      "UPDATE_EXPENSE_CAT",
      "ExpenseCategoryParam",
      id,
      `Atualizada categoria de despesa ${id}.`,
    );
  };

  const deleteExpenseCategory = (id: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      expenseCategories: (prev.expenseCategories || []).filter((e) => e.id !== id),
    }));
    addAuditLog(
      "DELETE_EXPENSE_CAT",
      "ExpenseCategoryParam",
      id,
      `Removida categoria de despesa ${id}.`,
    );
  };

  // Períodos Fiscais (Fiscal Periods)
  const addFiscalPeriod = (period: Omit<FiscalPeriodParam, "id">) => {
    const newPeriod: FiscalPeriodParam = {
      ...period,
      ...(period.status !== "Open"
        ? { closedBy: userPersona.name, closingDate: new Date().toISOString().slice(0, 10) }
        : {}),
      id: `fp-${crypto.randomUUID()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      fiscalPeriods: [...(prev.fiscalPeriods || []), newPeriod],
    }));
    addAuditLog(
      "CREATE_FISCAL_PERIOD",
      "FiscalPeriodParam",
      newPeriod.periodCode,
      `Adicionado período fiscal ${newPeriod.periodCode} (${newPeriod.status}).`,
    );
  };

  const updateFiscalPeriod = (id: string, data: Partial<FiscalPeriodParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      fiscalPeriods: (prev.fiscalPeriods || []).map((p) =>
        p.id === id
          ? {
              ...p,
              ...data,
              closedBy: data.status && data.status !== "Open" ? userPersona.name : undefined,
              closingDate:
                data.status && data.status !== "Open"
                  ? new Date().toISOString().slice(0, 10)
                  : undefined,
            }
          : p,
      ),
    }));
    addAuditLog(
      "UPDATE_FISCAL_PERIOD",
      "FiscalPeriodParam",
      id,
      `Atualizado status do período fiscal ${id}.`,
    );
  };

  const deleteFiscalPeriod = (id: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      fiscalPeriods: (prev.fiscalPeriods || []).filter((p) => p.id !== id),
    }));
    addAuditLog("DELETE_FISCAL_PERIOD", "FiscalPeriodParam", id, `Removido período fiscal ${id}.`);
  };

  // Reset para padrões da empresa ativa
  const resetParametersToDefault = () => {
    const def = createInitialCompanyData(activeCompany.id);
    updateCompanyData((prev) => ({
      ...prev,
      currencies: def.currencies,
      taxJurisdictions: def.taxJurisdictions,
      paymentTerms: def.paymentTerms,
      costCenters: def.costCenters,
      expenseCategories: def.expenseCategories,
      fiscalPeriods: def.fiscalPeriods,
    }));
    addAuditLog(
      "RESET_PARAMETERS",
      "CompanyParameters",
      activeCompany.id,
      `Restaurados parâmetros padrão para a empresa ${activeCompany.name}.`,
    );
  };

  const { accountBalances, totalDebitSum, totalCreditSum, isLedgerBalanced } = (() => {
    const balances: Record<string, { debit: number; credit: number; net: number }> = {};

    currentData.accounts.forEach((a) => {
      balances[a.code] = { debit: 0, credit: 0, net: 0 };
    });

    let debSum = 0;
    let credSum = 0;

    currentData.journals
      .filter((j) => j.date <= new Date().toISOString().slice(0, 10))
      .forEach((j) => {
        // Include the original and its reversal so their balances cancel.
        j.lines.forEach((l) => {
          if (!balances[l.accountCode]) {
            balances[l.accountCode] = { debit: 0, credit: 0, net: 0 };
          }
          balances[l.accountCode]!.debit += l.debit;
          balances[l.accountCode]!.credit += l.credit;
          debSum += l.debit;
          credSum += l.credit;
        });
      });

    currentData.accounts.forEach((a) => {
      const b = balances[a.code];
      if (b) {
        if (a.balanceType === "Debit") {
          b.net = Math.round((b.debit - b.credit) * 100) / 100;
        } else {
          b.net = Math.round((b.credit - b.debit) * 100) / 100;
        }
      }
    });

    debSum = Math.round(debSum * 100) / 100;
    credSum = Math.round(credSum * 100) / 100;

    return {
      accountBalances: balances,
      totalDebitSum: debSum,
      totalCreditSum: credSum,
      isLedgerBalanced: Math.abs(debSum - credSum) < 0.05,
    };
  })();

  const sumType = (type: AccountType) => totalByType(currentData.accounts, accountBalances, type);
  const totalRevenue = sumType("Revenue");
  const totalCOGS = sumType("COGS");
  const grossProfit = totalRevenue - totalCOGS;
  const totalOpEx = sumType("Operating Expense");
  const operatingIncome = grossProfit - totalOpEx;
  const fx = accountBalances[resolveAccount(currentData.accounts, "80300", "6300")];
  const totalFXVariance = (fx?.credit || 0) - (fx?.debit || 0);
  const netIncome =
    Math.round((operatingIncome + sumType("Other Income") - sumType("Other Expense")) * 100) / 100;
  const net = (preferred: string, legacy: string) =>
    accountBalances[resolveAccount(currentData.accounts, preferred, legacy)]?.net || 0;
  const cashOnHand = ["10100", "10200", "10300", "10400", "1000", "1050"].reduce(
    (sum, code) => sum + (accountBalances[code]?.net || 0),
    0,
  );
  const totalAR = net("11000", "1100");
  const totalAP = net("20100", "2000");
  const totalInventoryValuation = net("13000", "1300");

  return {
    getState: () => nextData,
    getCompany: () => activeCompany,
    value: {
      customers: currentData.customers || [],
      addCustomer: (data: CustomerInput) => {
        const customer = customerSchema.parse(data);
        if (customer.shippingSameAsBilling)
          customer.shippingAddress = { ...customer.billingAddress };
        updateCompanyData((prev) => ({
          ...prev,
          customers: [...(prev.customers || []), { ...customer, id: crypto.randomUUID() }],
        }));
      },
      updateCustomer: (id: string, data: CustomerInput) => {
        if (!currentData.customers.some((c) => c.id === id))
          throw new Error("Cliente não encontrado.");
        const customer = customerSchema.parse(data);
        if (customer.shippingSameAsBilling)
          customer.shippingAddress = { ...customer.billingAddress };
        updateCompanyData((prev) => ({
          ...prev,
          customers: prev.customers.map((c) => (c.id === id ? { ...customer, id } : c)),
        }));
      },
      activeCompany,
      companies,
      setActiveCompanyId,
      currentRole,
      setCurrentRole,
      userPersona,
      accounts: currentData.accounts,
      dimensions: currentData.dimensions,
      saveDimension: (input: Dimension) => {
        if (!userPersona.canCreateJournals) throw new Error("Unauthorized.");
        const dimension = dimensionSchema.parse(input);
        const updated = [...currentData.dimensions.filter((d) => d.id !== dimension.id), dimension];
        validateDimensionDefinitions(updated);
        for (const doc of [...currentData.invoices, ...currentData.bills, ...currentData.journals])
          validateDimensionValues(
            updated,
            doc.dimensionValues,
            "items" in doc ? doc.items.map((i) => i.id) : doc.lines.map((l) => l.id),
          );
        updateCompanyData((prev) => ({ ...prev, dimensions: updated }));
        addAuditLog(
          "SAVE_DIMENSION",
          "Dimension",
          dimension.id,
          `Saved management dimension ${dimension.name}.`,
        );
      },
      installUsGaapCoa,
      addAccount,
      updateAccount,
      deleteAccount,
      journals: currentData.journals,
      postJournalEntry,
      reverseJournalEntry,
      togglePeriodLock,
      inventory: currentData.inventory,
      addInventoryItem,
      adjustStock,
      setCostMethod,
      invoices: currentData.invoices,
      createInvoice,
      recordInvoicePayment,
      vendors: currentData.vendors,
      addVendor,
      updateVendor,
      deleteVendor,
      deleteCustomer,
      bills: currentData.bills,
      createBill,
      payBill,
      revalueOpenItems,
      projects: currentData.projects,
      createProject,
      statements: currentData.statements,
      stagingRows: currentData.stagingRows,
      importStatement,
      classifyStagingRow,
      taxes: currentData.taxes,
      recordTaxRemittance,
      auditLogs: currentData.auditLogs,
      currencies: currentData.currencies || [],
      addCurrency,
      updateCurrency,
      deleteCurrency,
      taxJurisdictions: currentData.taxJurisdictions || [],
      addTaxJurisdiction,
      updateTaxJurisdiction,
      deleteTaxJurisdiction,
      paymentTerms: currentData.paymentTerms || [],
      addPaymentTerm,
      updatePaymentTerm,
      deletePaymentTerm,
      costCenters: currentData.costCenters || [],
      addCostCenter,
      updateCostCenter,
      deleteCostCenter,
      expenseCategories: currentData.expenseCategories || [],
      addExpenseCategory,
      updateExpenseCategory,
      deleteExpenseCategory,
      fiscalPeriods: currentData.fiscalPeriods || [],
      addFiscalPeriod,
      updateFiscalPeriod,
      deleteFiscalPeriod,
      resetParametersToDefault,
      accountBalances,
      isLedgerBalanced,
      totalDebitSum,
      totalCreditSum,
      netIncome,
      totalRevenue,
      totalCOGS,
      grossProfit,
      totalOpEx,
      operatingIncome,
      totalFXVariance,
      cashOnHand,
      totalAR,
      totalAP,
      totalInventoryValuation,
    },
  };
}
