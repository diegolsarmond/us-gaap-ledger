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
    | "BankStaging";
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

export interface Invoice {
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
  status: "Open" | "Paid" | "Overdue";
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

export interface Bill {
  id: string;
  vendorName: string;
  billNumber: string;
  date: string;
  dueDate: string;
  currency: string;
  fxRate: number;
  foreignAmount: number;
  usdAmount: number;
  items: BillItem[];
  status: "Open" | "Paid";
  paymentDate?: string | undefined;
  paidFxRate?: number | undefined;
  realizedFxDiff?: number | undefined;
  projectId?: string | undefined;
}

export interface Project {
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

export interface CurrencyParam {
  code: string;
  name: string;
  symbol: string;
  exchangeRateToUsd: number;
  isBaseCurrency: boolean;
  quotationType: "Fixed" | "Float" | "Central Bank";
  status: "Active" | "Inactive";
  lastUpdated: string;
}

export interface TaxJurisdictionParam {
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

export interface PaymentTermParam {
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

export interface CostCenterParam {
  id: string;
  code: string;
  name: string;
  manager: string;
  annualBudget: number;
  description: string;
  status: "Active" | "Inactive";
}

export interface ExpenseCategoryParam {
  id: string;
  code: string;
  name: string;
  glAccountCode: string;
  taxDeductibility: "100% Deductible" | "50% Meals & Ent." | "Non-Deductible";
  description: string;
  status: "Active" | "Inactive";
}

export interface FiscalPeriodParam {
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
export function createInitialCompanyData(_companyId?: string): CompanyState { return {accounts: [],journals: [],inventory: [],projects: [],invoices: [],bills: [],statements: [],stagingRows: [],taxes: [],auditLogs: [],currencies: [],taxJurisdictions: [],paymentTerms: [],costCenters: [],expenseCategories: [],fiscalPeriods: []}; }

export interface AccountingContextType {
  activeCompany: ClientCompany;
  companies: ClientCompany[];
  setActiveCompanyId: (id: string) => void;
  currentRole: UserRole;
  setCurrentRole: (r: UserRole) => void;
  userPersona: UserPersona;

  accounts: Account[];
  addAccount: (account: Account) => void;

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
    }[];
    overrideReason?: string | undefined;
  }) => { success: boolean; error?: string | undefined; entryId?: string | undefined };
  reverseJournalEntry: (
    id: string,
    reason: string,
  ) => { success: boolean; error?: string | undefined };

  togglePeriodLock: (
    reason?: string | undefined,
  ) => { success: boolean; error?: string | undefined };

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
  ) => { success: boolean; error?: string | undefined };

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
  ) => { success: boolean; error?: string | undefined };

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

export function createAccountingEngine(currentData: CompanyState, initialCompany: ClientCompany, userPersona: UserPersona) {
 let activeCompany = {...initialCompany};
 let nextData = structuredClone(currentData);
 const currentRole = userPersona.role;
 const companies = [activeCompany];
 const setActiveCompanyId = (_id: string) => {};
 const setCurrentRole = (_role: UserRole) => {};
 const setCompanies = (updater: (items: ClientCompany[]) => ClientCompany[]) => { activeCompany = updater([activeCompany])[0]!; };
 const updateCompanyData = (updater: (prev: CompanyState) => CompanyState) => { nextData = updater(nextData); };
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

    const period = currentData.fiscalPeriods.find(p => p.startDate <= date && p.endDate >= date);
    if (!period) return {success:false,error:"Cadastre um período fiscal que inclua a data do lançamento."};
    if (activeCompany.isPeriodClosed || period.status === "Locked") {
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

    if (!lines.length || lines.length < 2) return {success:false,error:"Informe pelo menos duas linhas."};
    for (const line of lines) {
      if (!currentData.accounts.some(a => a.code === line.accountCode)) return {success:false,error:`Cadastre a conta contábil ${line.accountCode} antes de operar.`};
      if (!Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0)) return {success:false,error:"Débito/crédito inválido."};
    }
    if(lines.length<2)return {success:false,error:"Informe pelo menos duas linhas."};
    for(const line of lines){if(!currentData.accounts.some(a=>a.code===line.accountCode))return {success:false,error:`Cadastre a conta contábil ${line.accountCode} antes de operar.`};}
    const totalDebit =
      Math.round(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) * 100) / 100;
    const totalCredit =
      Math.round(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0) * 100) / 100;

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return {
        success: false,
        error: `Journal entry does not balance! Total Debits ($${totalDebit.toFixed(2)}) must equal Total Credits ($${totalCredit.toFixed(2)}). Difference: $${Math.abs(totalDebit - totalCredit).toFixed(2)}`,
      };
    }

    const entryId = `JE-${new Date().getFullYear()}-${String(currentData.journals.length + 1).padStart(4, "0")}`;
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
    const newInvoice: Invoice = {
      ...invData,
      id: invId,
      status: "Open",
    };

    let totalCogsToRelieve = 0;
    const updatedInventory = currentData.inventory.map((item) => {
      const line = invData.items.find((i) => i.sku === item.sku && i.isProduct);
      if (!line || line.qty <= 0) return item;

      let neededQty = line.qty;
      let lineCogs = 0;

      if (activeCompany.costMethod === "FIFO" && item.costLots.length > 0) {
        const remainingLots: typeof item.costLots = [];
        for (const lot of item.costLots) {
          if (neededQty <= 0) {
            remainingLots.push(lot);
          } else if (lot.qty <= neededQty) {
            neededQty -= lot.qty;
            lineCogs += lot.qty * lot.unitCost;
          } else {
            lineCogs += neededQty * lot.unitCost;
            remainingLots.push({ ...lot, qty: lot.qty - neededQty });
            neededQty = 0;
          }
        }
        totalCogsToRelieve += lineCogs;
        return {
          ...item,
          qtyOnHand: Math.max(0, item.qtyOnHand - line.qty),
          costLots: remainingLots,
        };
      } else {
        const cogsAmount = line.qty * item.unitCost;
        totalCogsToRelieve += cogsAmount;
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
    }[] = [];

    jeLines.push({
      accountCode: "1100",
      debit: newInvoice.total,
      credit: 0,
      memo: `AR — ${newInvoice.customerName}`,
      projectId: newInvoice.projectId,
    });

    const isService = newInvoice.kind === "Service";
    const revenueAccount = isService ? "4000" : "4100";
    jeLines.push({
      accountCode: revenueAccount,
      debit: 0,
      credit: newInvoice.subtotal,
      memo: `Sales revenue for ${invId}`,
      projectId: newInvoice.projectId,
    });

    if (newInvoice.taxAmount > 0) {
      jeLines.push({
        accountCode: "2200",
        debit: 0,
        credit: newInvoice.taxAmount,
        memo: `Sales tax collected (${newInvoice.taxRate}%) on ${invId}`,
      });
    }

    if (totalCogsToRelieve > 0) {
      const roundedCogs = Math.round(totalCogsToRelieve * 100) / 100;
      jeLines.push({
        accountCode: "5000",
        debit: roundedCogs,
        credit: 0,
        memo: `COGS recognized for items on ${invId}`,
        projectId: newInvoice.projectId,
      });
      jeLines.push({
        accountCode: "1300",
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

  const recordInvoicePayment = (invoiceId: string, paymentDate: string) => {
    const inv = currentData.invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, error: "Invoice not found." };
    if (inv.status === "Paid") return { success: false, error: "Invoice is already paid." };

    const jeLines = [
      {
        accountCode: "1000",
        debit: inv.total,
        credit: 0,
        memo: `Cash receipt from ${inv.customerName} for ${inv.id}`,
      },
      { accountCode: "1100", debit: 0, credit: inv.total, memo: `Clear AR for ${inv.id}` },
    ];

    const postResult = postJournalEntry({
      date: paymentDate,
      memo: `Payment received for ${inv.id} — ${inv.customerName}`,
      sourceType: "Payment",
      sourceId: inv.id,
      lines: jeLines,
    });

    if (!postResult.success) return postResult;

    updateCompanyData((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) =>
        i.id === invoiceId ? { ...i, status: "Paid" as const, paymentDate } : i,
      ),
    }));

    addAuditLog(
      "RECORD_PAYMENT",
      "Invoice",
      inv.id,
      `Recorded full payment of $${inv.total.toFixed(2)} clearing Accounts Receivable.`,
    );

    return { success: true };
  };

  const createBill: AccountingContextType["createBill"] = (billData) => {
    if (!userPersona.canCreateJournals) return { success: false, error: "Unauthorized." };

    const billId = `BILL-${new Date().getFullYear().toString().substr(2)}${String(currentData.bills.length + 1).padStart(3, "0")}`;
    const usdAmount = Math.round((billData.foreignAmount / (billData.fxRate || 1.0)) * 100) / 100;

    const newBill: Bill = {
      ...billData,
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
    }[] = [];

    newBill.items.forEach((item) => {
      jeLines.push({
        accountCode: item.accountCode,
        debit: item.amount,
        credit: 0,
        memo: item.description,
        projectId: item.projectId || newBill.projectId,
      });
    });

    jeLines.push({
      accountCode: "2000",
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

  const payBill = (billId: string, paymentDate: string, settlementFxRate?: number | undefined) => {
    const bill = currentData.bills.find((b) => b.id === billId);
    if (!bill) return { success: false, error: "Bill not found." };
    if (bill.status === "Paid") return { success: false, error: "Bill is already paid." };

    const effectiveSettlementRate = settlementFxRate || bill.fxRate;
    const actualCashPaidUsd =
      Math.round((bill.foreignAmount / effectiveSettlementRate) * 100) / 100;
    const originalApUsd = bill.usdAmount;
    const diff = Math.round((originalApUsd - actualCashPaidUsd) * 100) / 100;

    const jeLines: {
      accountCode: string;
      debit: number;
      credit: number;
      memo?: string | undefined;
      projectId?: string | undefined;
    }[] = [];

    jeLines.push({
      accountCode: "2000",
      debit: originalApUsd,
      credit: 0,
      memo: `Clear AP on ${bill.id} (${bill.vendorName})`,
      projectId: bill.projectId,
    });

    jeLines.push({
      accountCode: "1000",
      debit: 0,
      credit: actualCashPaidUsd,
      memo: `Cash wire in ${bill.currency} @ rate ${effectiveSettlementRate}`,
    });

    if (Math.abs(diff) >= 0.01) {
      if (diff > 0) {
        jeLines.push({
          accountCode: "6300",
          debit: 0,
          credit: diff,
          memo: `Realized FX Gain on settlement of ${bill.id}`,
        });
      } else {
        jeLines.push({
          accountCode: "6300",
          debit: Math.abs(diff),
          credit: 0,
          memo: `Realized FX Loss on settlement of ${bill.id}`,
        });
      }
    }

    const postResult = postJournalEntry({
      date: paymentDate,
      memo: `Payment of ${bill.id} (${bill.vendorName}) — ${bill.currency} ${bill.foreignAmount.toLocaleString()}`,
      sourceType: "Payment",
      sourceId: bill.id,
      currency: "USD",
      lines: jeLines,
    });

    if (!postResult.success) return postResult;

    updateCompanyData((prev) => ({
      ...prev,
      bills: prev.bills.map((b) =>
        b.id === billId
          ? {
              ...b,
              status: "Paid" as const,
              paymentDate,
              paidFxRate: effectiveSettlementRate,
              realizedFxDiff: diff,
            }
          : b,
      ),
    }));

    addAuditLog(
      "PAY_BILL",
      "Bill",
      bill.id,
      `Paid bill to ${bill.vendorName}. Cash Out: $${actualCashPaidUsd.toFixed(2)}, Realized FX Variance: $${diff.toFixed(2)}.`,
    );

    return { success: true };
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
        accountCode: "1300",
        debit: isIncrease ? adjustmentValue : 0,
        credit: isIncrease ? 0 : adjustmentValue,
        memo: `Inventory adjustment for ${item.sku}: ${memo}`,
      },
      {
        accountCode: "5000",
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

  const importStatement = ({name, accountCode, content}: {name: string; type: "CSV" | "OFX" | "PDF"; accountCode: string; content: string}) => {
    const parsed = parseStatementCsv(content);
    if (!currentData.accounts.some(a => a.code === accountCode)) throw new Error("Cadastre e selecione a conta bancária no plano de contas.");
    const fileId = crypto.randomUUID();
    const newFile: BankStatementFile = { id: fileId, fileName: name, fileType: "CSV", accountCode, rowsCount: parsed.length, uploadedAt: new Date().toISOString(), uploadedBy: userPersona.name, status: "Pending Review", content };
    updateCompanyData(prev => ({...prev, statements: [newFile,...prev.statements], stagingRows: [...parsed.map(row => ({...row, id: crypto.randomUUID(), fileId, suggestedAccount: "", status: "Pending" as const})),...prev.stagingRows]}));
    addAuditLog("IMPORT_STATEMENT", "BankStatementFile",fileId,"Imported CSV: " + name);
  };

  const classifyStagingRow = (rowId: string, targetAccountCode: string) => {
    const row = currentData.stagingRows.find((r) => r.id === rowId);
    if (!row || row.status !== "Pending") throw new Error("Linha indisponível para classificação.");

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
        accountCode: currentData.statements.find(s => s.id === row.fileId)!.accountCode,
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
        accountCode: "2200",
        debit: tax.dueAmount,
        credit: 0,
        memo: `Tax remittance: ${tax.jurisdiction}`,
      },
      {
        accountCode: "1000",
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

  const addAccount = (acct: Account) => {
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

  // --- CRUD de Parâmetros ---

  // Moedas (Currencies)
  const addCurrency = (curr: CurrencyParam) => {
    updateCompanyData((prev) => ({
      ...prev,
      currencies: [...(prev.currencies || []).filter((c) => c.code !== curr.code), curr],
    }));
    addAuditLog("CREATE_CURRENCY", "CurrencyParam", curr.code, `Adicionada moeda ${curr.code} (${curr.name}) com taxa de ${curr.exchangeRateToUsd}.`);
  };

  const updateCurrency = (code: string, data: Partial<CurrencyParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      currencies: (prev.currencies || []).map((c) =>
        c.code === code ? { ...c, ...data, lastUpdated: new Date().toISOString().split("T")[0]! } : c,
      ),
    }));
    addAuditLog("UPDATE_CURRENCY", "CurrencyParam", code, `Atualizados parâmetros da moeda ${code}.`);
  };

  const deleteCurrency = (code: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      currencies: (prev.currencies || []).filter((c) => c.code !== code),
    }));
    addAuditLog("DELETE_CURRENCY", "CurrencyParam", code, `Removida moeda ${code} do catálogo de taxas.`);
  };

  // Jurisdições Fiscais (Tax Jurisdictions)
  const addTaxJurisdiction = (tax: Omit<TaxJurisdictionParam, "id">) => {
    const newTax: TaxJurisdictionParam = {
      ...tax,
      id: `tax-jur-${Date.now()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      taxJurisdictions: [...(prev.taxJurisdictions || []), newTax],
    }));
    addAuditLog("CREATE_TAX_JURISDICTION", "TaxJurisdictionParam", newTax.code, `Cadastrada jurisdição fiscal ${newTax.name} (${newTax.rate}%).`);
  };

  const updateTaxJurisdiction = (id: string, data: Partial<TaxJurisdictionParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      taxJurisdictions: (prev.taxJurisdictions || []).map((t) =>
        t.id === id ? { ...t, ...data } : t,
      ),
    }));
    addAuditLog("UPDATE_TAX_JURISDICTION", "TaxJurisdictionParam", id, `Atualizada jurisdição fiscal ${id}.`);
  };

  const deleteTaxJurisdiction = (id: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      taxJurisdictions: (prev.taxJurisdictions || []).filter((t) => t.id !== id),
    }));
    addAuditLog("DELETE_TAX_JURISDICTION", "TaxJurisdictionParam", id, `Removida jurisdição fiscal ${id}.`);
  };

  // Prazos e Condições Comerciais (Payment Terms)
  const addPaymentTerm = (term: Omit<PaymentTermParam, "id">) => {
    const newTerm: PaymentTermParam = {
      ...term,
      id: `term-${Date.now()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      paymentTerms: [...(prev.paymentTerms || []), newTerm],
    }));
    addAuditLog("CREATE_PAYMENT_TERM", "PaymentTermParam", newTerm.code, `Cadastrada condição comercial ${newTerm.name} (${newTerm.days} dias).`);
  };

  const updatePaymentTerm = (id: string, data: Partial<PaymentTermParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      paymentTerms: (prev.paymentTerms || []).map((p) =>
        p.id === id ? { ...p, ...data } : p,
      ),
    }));
    addAuditLog("UPDATE_PAYMENT_TERM", "PaymentTermParam", id, `Atualizada condição de pagamento ${id}.`);
  };

  const deletePaymentTerm = (id: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      paymentTerms: (prev.paymentTerms || []).filter((p) => p.id !== id),
    }));
    addAuditLog("DELETE_PAYMENT_TERM", "PaymentTermParam", id, `Removida condição comercial ${id}.`);
  };

  // Centros de Custo (Cost Centers)
  const addCostCenter = (cc: Omit<CostCenterParam, "id">) => {
    const newCC: CostCenterParam = {
      ...cc,
      id: `cc-${Date.now()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      costCenters: [...(prev.costCenters || []), newCC],
    }));
    addAuditLog("CREATE_COST_CENTER", "CostCenterParam", newCC.code, `Cadastrado centro de custo ${newCC.code} - ${newCC.name}.`);
  };

  const updateCostCenter = (id: string, data: Partial<CostCenterParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      costCenters: (prev.costCenters || []).map((c) =>
        c.id === id ? { ...c, ...data } : c,
      ),
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
      id: `exp-cat-${Date.now()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      expenseCategories: [...(prev.expenseCategories || []), newCat],
    }));
    addAuditLog("CREATE_EXPENSE_CAT", "ExpenseCategoryParam", newCat.code, `Cadastrada categoria de despesa ${newCat.name} (Conta ${newCat.glAccountCode}).`);
  };

  const updateExpenseCategory = (id: string, data: Partial<ExpenseCategoryParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      expenseCategories: (prev.expenseCategories || []).map((e) =>
        e.id === id ? { ...e, ...data } : e,
      ),
    }));
    addAuditLog("UPDATE_EXPENSE_CAT", "ExpenseCategoryParam", id, `Atualizada categoria de despesa ${id}.`);
  };

  const deleteExpenseCategory = (id: string) => {
    updateCompanyData((prev) => ({
      ...prev,
      expenseCategories: (prev.expenseCategories || []).filter((e) => e.id !== id),
    }));
    addAuditLog("DELETE_EXPENSE_CAT", "ExpenseCategoryParam", id, `Removida categoria de despesa ${id}.`);
  };

  // Períodos Fiscais (Fiscal Periods)
  const addFiscalPeriod = (period: Omit<FiscalPeriodParam, "id">) => {
    const newPeriod: FiscalPeriodParam = {
      ...period,
      id: `fp-${Date.now()}`,
    };
    updateCompanyData((prev) => ({
      ...prev,
      fiscalPeriods: [...(prev.fiscalPeriods || []), newPeriod],
    }));
    addAuditLog("CREATE_FISCAL_PERIOD", "FiscalPeriodParam", newPeriod.periodCode, `Adicionado período fiscal ${newPeriod.periodCode} (${newPeriod.status}).`);
  };

  const updateFiscalPeriod = (id: string, data: Partial<FiscalPeriodParam>) => {
    updateCompanyData((prev) => ({
      ...prev,
      fiscalPeriods: (prev.fiscalPeriods || []).map((p) =>
        p.id === id ? { ...p, ...data } : p,
      ),
    }));
    addAuditLog("UPDATE_FISCAL_PERIOD", "FiscalPeriodParam", id, `Atualizado status do período fiscal ${id}.`);
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
    addAuditLog("RESET_PARAMETERS", "CompanyParameters", activeCompany.id, `Restaurados parâmetros padrão para a empresa ${activeCompany.name}.`);
  };

  const { accountBalances, totalDebitSum, totalCreditSum, isLedgerBalanced } = (() => {
    const balances: Record<string, { debit: number; credit: number; net: number }> = {};

    currentData.accounts.forEach((a) => {
      balances[a.code] = { debit: 0, credit: 0, net: 0 };
    });

    let debSum = 0;
    let credSum = 0;

    currentData.journals.forEach((j) => {
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

  const totalRevenue = (accountBalances["4000"]?.net || 0) + (accountBalances["4100"]?.net || 0);
  const totalCOGS = accountBalances["5000"]?.net || 0;
  const grossProfit = totalRevenue - totalCOGS;
  const totalOpEx = (accountBalances["6100"]?.net || 0) + (accountBalances["6200"]?.net || 0);
  const operatingIncome = grossProfit - totalOpEx;
  const rawFx = (accountBalances["6300"]?.credit || 0) - (accountBalances["6300"]?.debit || 0);
  const totalFXVariance = Math.round(rawFx * 100) / 100;
  const netIncome = Math.round((operatingIncome + totalFXVariance) * 100) / 100;

  const cashOnHand = (accountBalances["1000"]?.net || 0) + (accountBalances["1050"]?.net || 0);
  const totalAR = accountBalances["1100"]?.net || 0;
  const totalAP = accountBalances["2000"]?.net || 0;
  const totalInventoryValuation = accountBalances["1300"]?.net || 0;

  return { getState: () => nextData, getCompany: () => activeCompany, value: {
        activeCompany,
        companies,
        setActiveCompanyId,
        currentRole,
        setCurrentRole,
        userPersona,
        accounts: currentData.accounts,
        addAccount,
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
        bills: currentData.bills,
        createBill,
        payBill,
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
  } };
}
