import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

export type UserRole =
  | "platform_admin"
  | "accounting_admin"
  | "accounting_staff"
  | "client_portal";

export interface UserPersona {
  role: UserRole;
  name: string;
  title: string;
  allowedReportsOnly: boolean;
  canClosePeriod: boolean;
  canManageUsers: boolean;
  canCreateJournals: boolean;
}

export const USER_PERSONAS: Record<UserRole, UserPersona> = {
  platform_admin: {
    role: "platform_admin",
    name: "Carlos A. (Platform Admin)",
    title: "Firm Owner & Administrator",
    allowedReportsOnly: false,
    canClosePeriod: true,
    canManageUsers: true,
    canCreateJournals: true,
  },
  accounting_admin: {
    role: "accounting_admin",
    name: "Sarah Jenkins, CPA",
    title: "Senior Accounting Manager",
    allowedReportsOnly: false,
    canClosePeriod: true,
    canManageUsers: false,
    canCreateJournals: true,
  },
  accounting_staff: {
    role: "accounting_staff",
    name: "Marcus Vance",
    title: "Staff Accountant",
    allowedReportsOnly: false,
    canClosePeriod: false,
    canManageUsers: false,
    canCreateJournals: true,
  },
  client_portal: {
    role: "client_portal",
    name: "Daniel Whitfield (Client)",
    title: "Client Executive Portal",
    allowedReportsOnly: true,
    canClosePeriod: false,
    canManageUsers: false,
    canCreateJournals: false,
  },
};

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

export const STANDARD_CHART_OF_ACCOUNTS: Account[] = [
  { code: "1000", name: "Cash — Operating (Chase)", type: "Asset", balanceType: "Debit", description: "Primary operating checking account" },
  { code: "1050", name: "Cash — Money Market Reserve", type: "Asset", balanceType: "Debit", description: "Interest-bearing liquidity reserve" },
  { code: "1100", name: "Accounts Receivable (Trade)", type: "Asset", balanceType: "Debit", description: "Customer trade credit receivables" },
  { code: "1200", name: "Allowance for Doubtful Accounts", type: "Asset", balanceType: "Credit", description: "Contra-asset reserve under CECL" },
  { code: "1300", name: "Merchandise Inventory", type: "Asset", balanceType: "Debit", description: "Goods on hand valued at lower of cost or NRV" },
  { code: "1400", name: "Prepaid Expenses & Deposits", type: "Asset", balanceType: "Debit", description: "Prepaid insurance and facility leases" },
  { code: "2000", name: "Accounts Payable (Trade)", type: "Liability", balanceType: "Credit", description: "Short-term obligations to trade vendors" },
  { code: "2100", name: "Credit Card Payable (Amex)", type: "Liability", balanceType: "Credit", description: "Corporate purchasing card balance" },
  { code: "2200", name: "Sales Tax Payable", type: "Liability", balanceType: "Credit", description: "State and local sales taxes collected" },
  { code: "2300", name: "Accrued Payroll & Benefits", type: "Liability", balanceType: "Credit", description: "Earned but unpaid wages" },
  { code: "3000", name: "Owner's Equity / Paid-in Capital", type: "Equity", balanceType: "Credit", description: "Capital contributions from members/shareholders" },
  { code: "3100", name: "Retained Earnings", type: "Equity", balanceType: "Credit", description: "Accumulated net earnings from prior fiscal years" },
  { code: "4000", name: "Service & Consulting Revenue", type: "Revenue", balanceType: "Credit", description: "Fees earned for professional services" },
  { code: "4100", name: "Product Sales Revenue", type: "Revenue", balanceType: "Credit", description: "Gross proceeds from merchandise sales" },
  { code: "5000", name: "Cost of Goods Sold (COGS)", type: "COGS", balanceType: "Debit", description: "Direct product cost recognized upon sale" },
  { code: "6100", name: "Selling & Marketing Expense", type: "Operating Expense", balanceType: "Debit", description: "Customer acquisition and promotion costs" },
  { code: "6200", name: "General & Administrative Expense", type: "Operating Expense", balanceType: "Debit", description: "Rent, utilities, legal, and software overhead" },
  { code: "6300", name: "Foreign Exchange Gain / Loss (Realized)", type: "Other Expense", balanceType: "Debit", description: "Realized currency variances on settlement" },
];

export interface JournalLine {
  id: string;
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string;
  projectId?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  memo: string;
  sourceType: "Invoice" | "Bill" | "Payment" | "Manual" | "OpeningBalance" | "InventoryAdjustment" | "BankStaging";
  sourceId?: string;
  currency: string;
  fxRate: number;
  lines: JournalLine[];
  status: "Posted" | "Reversed";
  overrideReason?: string;
  createdBy: string;
  createdAt: string;
}

export interface ClientCompany {
  id: string;
  name: string;
  initials: string;
  ein: string;
  entity: "LLC" | "C-Corp" | "S-Corp";
  basis: "Accrual" | "Cash";
  state: string;
  baseCurrency: "USD";
  costMethod: "FIFO" | "WeightedAverage";
  isPeriodClosed: boolean;
  activePeriod: string;
}

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
  sku?: string;
  isProduct: boolean;
  qty: number;
  unitPrice: number;
  taxable: boolean;
}

export interface Invoice {
  id: string;
  customerName: string;
  customerEin?: string;
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
  projectId?: string;
  paymentDate?: string;
}

export interface BillItem {
  id: string;
  description: string;
  accountCode: string;
  isInventory: boolean;
  sku?: string;
  qty?: number;
  amount: number;
  projectId?: string;
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
  paymentDate?: string;
  paidFxRate?: number;
  realizedFxDiff?: number;
  projectId?: string;
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
  classifiedAccount?: string;
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
  receiptFileName?: string;
  paidAt?: string;
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
  overrideReason?: string;
}

export const INITIAL_COMPANIES: ClientCompany[] = [
  {
    id: "harbor-ridge",
    name: "Harbor Ridge Marine LLC",
    initials: "HR",
    ein: "84-2201987",
    entity: "LLC",
    basis: "Accrual",
    state: "FL",
    baseCurrency: "USD",
    costMethod: "FIFO",
    isPeriodClosed: false,
    activePeriod: "2026-12",
  },
  {
    id: "meridian-labs",
    name: "Meridian Labs Diagnostics Inc.",
    initials: "ML",
    ein: "88-4410233",
    entity: "C-Corp",
    basis: "Accrual",
    state: "TX",
    baseCurrency: "USD",
    costMethod: "WeightedAverage",
    isPeriodClosed: false,
    activePeriod: "2026-12",
  },
  {
    id: "cedar-vine",
    name: "Cedar & Vine Hospitality LLC",
    initials: "CV",
    ein: "82-7719045",
    entity: "S-Corp",
    basis: "Accrual",
    state: "CA",
    baseCurrency: "USD",
    costMethod: "FIFO",
    isPeriodClosed: false,
    activePeriod: "2026-12",
  },
];

function createInitialCompanyData(companyId: string) {
  const f = companyId === "meridian-labs" ? 1.65 : companyId === "cedar-vine" ? 0.6 : 1.0;
  const round = (n: number) => Math.round(n * f * 100) / 100;

  const inventory: InventoryItem[] = [
    {
      id: "item-1",
      sku: "HR-1001",
      name: "Marine Hardware Stainless Kit",
      type: "Product",
      qtyOnHand: 148,
      unitCost: 62.4,
      unitPrice: 124.0,
      valuationMethod: "FIFO",
      costLots: [
        { id: "lot-1a", qty: 48, unitCost: 60.0, date: "2026-11-10" },
        { id: "lot-1b", qty: 100, unitCost: 63.55, date: "2026-12-02" },
      ],
    },
    {
      id: "item-2",
      sku: "HR-1044",
      name: "Composite Structural Deck Panel",
      type: "Product",
      qtyOnHand: 92,
      unitCost: 128.5,
      unitPrice: 245.0,
      valuationMethod: "FIFO",
      costLots: [{ id: "lot-2a", qty: 92, unitCost: 128.5, date: "2026-11-15" }],
    },
    {
      id: "item-3",
      sku: "HR-2010",
      name: "316 Marine Fastener Set (500pc)",
      type: "Product",
      qtyOnHand: 610,
      unitCost: 8.9,
      unitPrice: 18.5,
      valuationMethod: "WeightedAverage",
      costLots: [{ id: "lot-3a", qty: 610, unitCost: 8.9, date: "2026-11-20" }],
    },
    {
      id: "item-4",
      sku: "SRV-CONSULT",
      name: "Naval Architectural Engineering",
      type: "Service",
      qtyOnHand: 0,
      unitCost: 0,
      unitPrice: 185.0,
      valuationMethod: "FIFO",
      costLots: [],
    },
    {
      id: "item-5",
      sku: "SRV-INSPECT",
      name: "USCG Compliance Drydock Survey",
      type: "Service",
      qtyOnHand: 0,
      unitCost: 0,
      unitPrice: 2400.0,
      valuationMethod: "FIFO",
      costLots: [],
    },
  ];

  const projects: Project[] = [
    {
      id: "proj-101",
      code: "PRJ-2026-FL01",
      name: "Biscayne Bay Marina Refit",
      clientName: "Northgate Supply Co.",
      budget: round(65000),
      contractValue: round(92000),
      status: "Active",
      startDate: "2026-10-01",
      endDate: "2027-02-28",
      notes: "Commercial marine hardware refit under US GAAP Milestone Revenue Recognition.",
    },
    {
      id: "proj-102",
      code: "PRJ-2026-TX04",
      name: "Galveston Harbor Tugboat Overhaul",
      clientName: "Meridian Marine Systems",
      budget: round(110000),
      contractValue: round(158000),
      status: "Active",
      startDate: "2026-11-15",
      endDate: "2027-04-30",
      notes: "Complete hull reinforcement and mechanical survey.",
    },
    {
      id: "proj-103",
      code: "PRJ-2026-CA09",
      name: "San Diego Wharf Decking",
      clientName: "Pacific Coast Hospitality",
      budget: round(38000),
      contractValue: round(52000),
      status: "Completed",
      startDate: "2026-08-01",
      endDate: "2026-11-30",
      notes: "Finished on schedule with 28.4% gross margin.",
    },
  ];

  const invoices: Invoice[] = [
    {
      id: "INV-1048",
      customerName: "Northgate Supply Co.",
      date: "2026-12-05",
      dueDate: "2026-12-20",
      kind: "Service",
      projectId: "proj-101",
      items: [
        { id: "i1", description: "USCG Compliance Drydock Survey (2 units)", sku: "SRV-INSPECT", isProduct: false, qty: 2, unitPrice: round(2400), taxable: true },
        { id: "i2", description: "Naval Architectural Engineering (40 hrs)", sku: "SRV-CONSULT", isProduct: false, qty: 40, unitPrice: round(185), taxable: true },
      ],
      subtotal: round(12200),
      taxRate: 7.0,
      taxAmount: round(854),
      total: round(13054),
      taxExempt: false,
      status: "Paid",
      paymentDate: "2026-12-18",
    },
    {
      id: "INV-1049",
      customerName: "Meridian Labs Diagnostics Inc.",
      customerEin: "88-4410233",
      date: "2026-12-10",
      dueDate: "2027-01-10",
      kind: "Product",
      projectId: "proj-102",
      items: [
        { id: "i3", description: "Composite Structural Deck Panel (100 units)", sku: "HR-1044", isProduct: true, qty: 100, unitPrice: round(245), taxable: false },
      ],
      subtotal: round(24500),
      taxRate: 0.0,
      taxAmount: 0,
      total: round(24500),
      taxExempt: true,
      status: "Open",
    },
    {
      id: "INV-1050",
      customerName: "Solano Retail Marine Group",
      date: "2026-11-20",
      dueDate: "2026-12-05",
      kind: "Product",
      items: [
        { id: "i4", description: "Marine Hardware Stainless Kit (35 units)", sku: "HR-1001", isProduct: true, qty: 35, unitPrice: round(124), taxable: true },
        { id: "i5", description: "316 Marine Fastener Set (50 units)", sku: "HR-2010", isProduct: true, qty: 50, unitPrice: round(18.5), taxable: true },
      ],
      subtotal: round(5265),
      taxRate: 6.5,
      taxAmount: round(342.23),
      total: round(5607.23),
      taxExempt: false,
      status: "Overdue",
    },
  ];

  const bills: Bill[] = [
    {
      id: "BILL-3391",
      vendorName: "Baja Components S.A. de C.V.",
      billNumber: "BAJA-9921",
      date: "2026-12-02",
      dueDate: "2026-12-28",
      currency: "MXN",
      fxRate: 17.5,
      foreignAmount: round(147000),
      usdAmount: round(8400),
      items: [
        { id: "b1", description: "Extruded alloy transom brackets", accountCode: "1300", isInventory: true, sku: "HR-1001", qty: 50, amount: round(8400), projectId: "proj-101" },
      ],
      status: "Paid",
      paymentDate: "2026-12-17",
      paidFxRate: 17.15,
      realizedFxDiff: round(35.04),
    },
    {
      id: "BILL-3384",
      vendorName: "Atlas Maritime Logistics Corp.",
      billNumber: "ATL-7740",
      date: "2026-12-08",
      dueDate: "2026-12-24",
      currency: "USD",
      fxRate: 1.0,
      foreignAmount: round(5120),
      usdAmount: round(5120),
      items: [
        { id: "b2", description: "Freight & container transport from Miami port", accountCode: "5000", isInventory: false, amount: round(5120), projectId: "proj-101" },
      ],
      status: "Open",
    },
    {
      id: "BILL-3370",
      vendorName: "Rowan & Vance Maritime LLP",
      billNumber: "RV-4412",
      date: "2026-11-28",
      dueDate: "2026-12-15",
      currency: "USD",
      fxRate: 1.0,
      foreignAmount: round(3800),
      usdAmount: round(3800),
      items: [
        { id: "b3", description: "Coast Guard compliance legal counsel", accountCode: "6200", isInventory: false, amount: round(3800) },
      ],
      status: "Paid",
      paymentDate: "2026-12-14",
    },
    {
      id: "BILL-3362",
      vendorName: "Pemberton Marine Freight Ltd",
      billNumber: "PMF-1029",
      date: "2026-12-12",
      dueDate: "2027-01-12",
      currency: "GBP",
      fxRate: 0.79,
      foreignAmount: round(3950),
      usdAmount: round(5000),
      items: [
        { id: "b4", description: "Specialty marine navigation components", accountCode: "1300", isInventory: true, amount: round(5000) },
      ],
      status: "Open",
    },
  ];

  const initialJournals: JournalEntry[] = [
    {
      id: "JE-2026-0001",
      date: "2026-12-01",
      memo: "Opening balances carryforward — FY 2026",
      sourceType: "OpeningBalance",
      currency: "USD",
      fxRate: 1.0,
      status: "Posted",
      createdBy: "Carlos A. (Platform Admin)",
      createdAt: "2026-12-01T08:00:00Z",
      lines: [
        { id: "jl-1", accountCode: "1000", debit: round(82500), credit: 0 },
        { id: "jl-2", accountCode: "1100", debit: round(38500), credit: 0 },
        { id: "jl-3", accountCode: "1300", debit: round(38940), credit: 0 },
        { id: "jl-4", accountCode: "2000", debit: 0, credit: round(24500) },
        { id: "jl-5", accountCode: "2200", debit: 0, credit: round(3440) },
        { id: "jl-6", accountCode: "3000", debit: 0, credit: round(85000) },
        { id: "jl-7", accountCode: "3100", debit: 0, credit: round(47000) },
      ],
    },
    {
      id: "JE-2026-0482",
      date: "2026-12-05",
      memo: "Invoice INV-1048 — Northgate Supply Co. (Service revenue & tax)",
      sourceType: "Invoice",
      sourceId: "INV-1048",
      currency: "USD",
      fxRate: 1.0,
      status: "Posted",
      createdBy: "Marcus Vance",
      createdAt: "2026-12-05T10:15:00Z",
      lines: [
        { id: "jl-11", accountCode: "1100", debit: round(13054), credit: 0, projectId: "proj-101" },
        { id: "jl-12", accountCode: "4000", debit: 0, credit: round(12200), projectId: "proj-101" },
        { id: "jl-13", accountCode: "2200", debit: 0, credit: round(854) },
      ],
    },
    {
      id: "JE-2026-0483",
      date: "2026-12-10",
      memo: "Invoice INV-1049 — Meridian Labs (Product sales, tax-exempt)",
      sourceType: "Invoice",
      sourceId: "INV-1049",
      currency: "USD",
      fxRate: 1.0,
      status: "Posted",
      createdBy: "Marcus Vance",
      createdAt: "2026-12-10T14:30:00Z",
      lines: [
        { id: "jl-14", accountCode: "1100", debit: round(24500), credit: 0, projectId: "proj-102" },
        { id: "jl-15", accountCode: "4100", debit: 0, credit: round(24500), projectId: "proj-102" },
        { id: "jl-16", accountCode: "5000", debit: round(12850), credit: 0, projectId: "proj-102" },
        { id: "jl-17", accountCode: "1300", debit: 0, credit: round(12850) },
      ],
    },
    {
      id: "JE-2026-0484",
      date: "2026-12-17",
      memo: "Settlement of BILL-3391 (Baja Components) + Realized FX Gain",
      sourceType: "Payment",
      sourceId: "BILL-3391",
      currency: "USD",
      fxRate: 1.0,
      status: "Posted",
      createdBy: "Sarah Jenkins, CPA",
      createdAt: "2026-12-17T11:00:00Z",
      lines: [
        { id: "jl-18", accountCode: "2000", debit: round(8400), credit: 0, projectId: "proj-101" },
        { id: "jl-19", accountCode: "1000", debit: 0, credit: round(8364.96) },
        { id: "jl-20", accountCode: "6300", debit: 0, credit: round(35.04) },
      ],
    },
    {
      id: "JE-2026-0485",
      date: "2026-12-18",
      memo: "Cash collection on INV-1048 (Northgate Supply Co.)",
      sourceType: "Payment",
      sourceId: "INV-1048",
      currency: "USD",
      fxRate: 1.0,
      status: "Posted",
      createdBy: "Marcus Vance",
      createdAt: "2026-12-18T16:20:00Z",
      lines: [
        { id: "jl-21", accountCode: "1000", debit: round(13054), credit: 0 },
        { id: "jl-22", accountCode: "1100", debit: 0, credit: round(13054) },
      ],
    },
  ];

  const statements: BankStatementFile[] = [
    {
      id: "st-1",
      fileName: "chase-operating-2026-11.ofx",
      accountCode: "1000",
      fileType: "OFX",
      rowsCount: 84,
      uploadedAt: "2026-12-02 09:14 EST",
      uploadedBy: "Daniel Whitfield (Client)",
      status: "Reconciled",
    },
    {
      id: "st-2",
      fileName: "chase-operating-2026-12.csv",
      accountCode: "1000",
      fileType: "CSV",
      rowsCount: 42,
      uploadedAt: "2026-12-19 14:00 EST",
      uploadedBy: "Daniel Whitfield (Client)",
      status: "Pending Review",
    },
    {
      id: "st-3",
      fileName: "amex-business-2026-12.pdf",
      accountCode: "2100",
      fileType: "PDF",
      rowsCount: 28,
      uploadedAt: "2026-12-19 14:05 EST",
      uploadedBy: "Daniel Whitfield (Client)",
      status: "Pending Review",
    },
  ];

  const stagingRows: StagingRow[] = [
    {
      id: "row-1",
      fileId: "st-2",
      date: "2026-12-15",
      description: "GUSTO PAYROLL TAX & WAGES DIR DEP",
      amount: -18200.0,
      suggestedAccount: "2300",
      status: "Pending",
    },
    {
      id: "row-2",
      fileId: "st-2",
      date: "2026-12-16",
      description: "STRIPE PAYMENTS TRANSFER 4892",
      amount: 14210.0,
      suggestedAccount: "4000",
      status: "Pending",
    },
    {
      id: "row-3",
      fileId: "st-2",
      date: "2026-12-18",
      description: "HARBOR PROPERTY MANAGEMENT LEASE",
      amount: -4500.0,
      suggestedAccount: "6200",
      status: "Pending",
    },
    {
      id: "row-4",
      fileId: "st-2",
      date: "2026-12-18",
      description: "BAJA COMPONENTS WIRE PYMT",
      amount: -8364.96,
      suggestedAccount: "2000",
      status: "Classified",
      classifiedAccount: "2000",
    },
  ];

  const taxes: TaxRecord[] = [
    {
      id: "tax-1",
      jurisdiction: "Florida Department of Revenue (Sales & Use)",
      period: "2026-11",
      taxableBase: round(48200),
      rate: "7.00% (6% State + 1% County Surtax)",
      dueAmount: round(3374.0),
      status: "Paid",
      receiptFileName: "FL_DOR_Nov2026_Receipt_DR15.pdf",
      paidAt: "2026-12-18",
    },
    {
      id: "tax-2",
      jurisdiction: "Florida Department of Revenue (Sales & Use)",
      period: "2026-12",
      taxableBase: round(52480),
      rate: "7.00% (6% State + 1% County Surtax)",
      dueAmount: round(3673.6),
      status: "Pending Remittance",
    },
    {
      id: "tax-3",
      jurisdiction: "Internal Revenue Service — Form 1120 Estimated",
      period: "2026-Q4",
      taxableBase: round(37531.25),
      rate: "21.00% Federal Corporate Tax",
      dueAmount: round(7881.56),
      status: "Pending Remittance",
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: "log-1",
      timestamp: "2026-12-01 08:00:00 EST",
      actor: "Carlos A. (Platform Admin)",
      role: "Platform Administrator",
      action: "POST_OPENING_BALANCE",
      targetType: "JournalEntry",
      targetId: "JE-2026-0001",
      details: "Posted verified opening trial balance carryforward from legacy CPA schedules.",
    },
    {
      id: "log-2",
      timestamp: "2026-12-05 10:15:00 EST",
      actor: "Marcus Vance",
      role: "Accounting Staff",
      action: "ISSUE_INVOICE",
      targetType: "Invoice",
      targetId: "INV-1048",
      details: "Issued Service Invoice to Northgate Supply Co. Total $13,054.00 (Tax $854.00).",
    },
    {
      id: "log-3",
      timestamp: "2026-12-10 14:30:00 EST",
      actor: "Marcus Vance",
      role: "Accounting Staff",
      action: "ISSUE_INVOICE",
      targetType: "Invoice",
      targetId: "INV-1049",
      details: "Issued Tax-Exempt Product Invoice to Meridian Labs. Relieved 100 units of HR-1044 from Inventory to COGS.",
    },
    {
      id: "log-4",
      timestamp: "2026-12-17 11:00:00 EST",
      actor: "Sarah Jenkins, CPA",
      role: "Accounting Administrator",
      action: "PAY_BILL_FX",
      targetType: "Bill",
      targetId: "BILL-3391",
      details: "Paid MXN bill. Realized FX Gain of $35.04 recognized in Account 6300.",
    },
    {
      id: "log-5",
      timestamp: "2026-12-18 16:20:00 EST",
      actor: "Marcus Vance",
      role: "Accounting Staff",
      action: "RECORD_PAYMENT",
      targetType: "Invoice",
      targetId: "INV-1048",
      details: "Collected $13,054.00 via wire into Chase Operating account.",
    },
  ];

  return {
    accounts: STANDARD_CHART_OF_ACCOUNTS,
    journals: initialJournals,
    inventory,
    projects,
    invoices,
    bills,
    statements,
    stagingRows,
    taxes,
    auditLogs,
  };
}

export type CompanyState = ReturnType<typeof createInitialCompanyData>;

interface AccountingContextType {
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
    sourceId?: string;
    currency?: string;
    fxRate?: number;
    lines: { accountCode: string; debit: number; credit: number; memo?: string; projectId?: string }[];
    overrideReason?: string;
  }) => { success: boolean; error?: string; entryId?: string };
  reverseJournalEntry: (id: string, reason: string) => { success: boolean; error?: string };

  togglePeriodLock: (reason?: string) => void;

  inventory: InventoryItem[];
  addInventoryItem: (item: Omit<InventoryItem, "id" | "costLots">) => void;
  adjustStock: (itemId: string, qtyDelta: number, unitCost: number, memo: string) => void;
  setCostMethod: (method: "FIFO" | "WeightedAverage") => void;

  invoices: Invoice[];
  createInvoice: (inv: Omit<Invoice, "id" | "status">) => { success: boolean; error?: string; invoiceId?: string };
  recordInvoicePayment: (invoiceId: string, paymentDate: string) => { success: boolean; error?: string };

  bills: Bill[];
  createBill: (b: Omit<Bill, "id" | "status" | "usdAmount">) => { success: boolean; error?: string; billId?: string };
  payBill: (billId: string, paymentDate: string, settlementFxRate?: number) => { success: boolean; error?: string };

  projects: Project[];
  createProject: (p: Omit<Project, "id">) => void;

  statements: BankStatementFile[];
  stagingRows: StagingRow[];
  uploadMockStatement: (file: { name: string; type: "CSV" | "OFX" | "PDF"; accountCode: string }) => void;
  classifyStagingRow: (rowId: string, targetAccountCode: string) => void;

  taxes: TaxRecord[];
  recordTaxRemittance: (taxId: string, receiptName: string) => void;

  auditLogs: AuditLogEntry[];

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

const AccountingContext = createContext<AccountingContextType | null>(null);

const STORAGE_KEY_PREFIX = "us_gaap_ledger_state_v2_";

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<ClientCompany[]>(() => {
    if (typeof window === "undefined") return INITIAL_COMPANIES;
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}companies`);
    return saved ? JSON.parse(saved) : INITIAL_COMPANIES;
  });

  const [activeCompanyId, setActiveCompanyId] = useState<string>("harbor-ridge");
  const [currentRole, setCurrentRole] = useState<UserRole>("platform_admin");

  const [companiesData, setCompaniesData] = useState<Record<string, CompanyState>>(() => {
    if (typeof window === "undefined") {
      const initial: Record<string, CompanyState> = {};
      INITIAL_COMPANIES.forEach((c) => {
        initial[c.id] = createInitialCompanyData(c.id);
      });
      return initial;
    }
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}data`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved state", e);
      }
    }
    const initial: Record<string, CompanyState> = {};
    INITIAL_COMPANIES.forEach((c) => {
      initial[c.id] = createInitialCompanyData(c.id);
    });
    return initial;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}companies`, JSON.stringify(companies));
      localStorage.setItem(`${STORAGE_KEY_PREFIX}data`, JSON.stringify(companiesData));
    }
  }, [companies, companiesData]);

  const activeCompany = useMemo(() => {
    return companies.find((c) => c.id === activeCompanyId) || companies[0]!;
  }, [companies, activeCompanyId]);

  const currentData = useMemo(() => {
    return companiesData[activeCompany.id] || createInitialCompanyData(activeCompany.id);
  }, [companiesData, activeCompany.id]);

  const userPersona = USER_PERSONAS[currentRole];

  const updateCompanyData = (updater: (prev: CompanyState) => CompanyState) => {
    setCompaniesData((all) => {
      const prevCompany = all[activeCompany.id] || createInitialCompanyData(activeCompany.id);
      const nextCompany = updater(prevCompany);
      return { ...all, [activeCompany.id]: nextCompany };
    });
  };

  const addAuditLog = (action: string, targetType: string, targetId: string, details: string, overrideReason?: string) => {
    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "medium" }) + " EST",
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
      return { success: false, error: "Access denied: Client portal users cannot post journal entries." };
    }

    if (activeCompany.isPeriodClosed) {
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

    const totalDebit = Math.round(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) * 100) / 100;
    const totalCredit = Math.round(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0) * 100) / 100;

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return {
        success: false,
        error: `Journal entry does not balance! Total Debits ($${totalDebit.toFixed(2)}) must equal Total Credits ($${totalCredit.toFixed(2)}). Difference: $${Math.abs(totalDebit - totalCredit).toFixed(2)}`,
      };
    }

    const entryId = `JE-${new Date().getFullYear()}-${String(currentData.journals.length + 480).padStart(4, "0")}`;
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

    addAuditLog("POST_JOURNAL_ENTRY", "JournalEntry", entryId, `Posted balanced entry: ${memo} (Total: $${totalDebit.toFixed(2)})`, overrideReason);

    return { success: true, entryId };
  };

  const reverseJournalEntry = (id: string, reason: string) => {
    if (!userPersona.canCreateJournals) {
      return { success: false, error: "Access denied." };
    }
    const target = currentData.journals.find((j) => j.id === id);
    if (!target) return { success: false, error: "Journal entry not found." };
    if (target.status === "Reversed") return { success: false, error: "Entry has already been reversed." };

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
      journals: prev.journals.map((j) => (j.id === id ? { ...j, status: "Reversed" as const } : j)).concat(revEntry),
    }));

    addAuditLog("REVERSE_JOURNAL_ENTRY", "JournalEntry", target.id, `Reversed entry with counter-entry ${revId}. Reason: ${reason}`);

    return { success: true };
  };

  const togglePeriodLock = (reason?: string) => {
    if (!userPersona.canClosePeriod) {
      alert("Access Denied: Only an Administrator can lock or unlock accounting periods.");
      return;
    }
    const newStatus = !activeCompany.isPeriodClosed;
    setCompanies((prev) =>
      prev.map((c) => (c.id === activeCompany.id ? { ...c, isPeriodClosed: newStatus } : c))
    );
    addAuditLog(
      newStatus ? "LOCK_PERIOD" : "UNLOCK_PERIOD",
      "AccountingPeriod",
      activeCompany.activePeriod,
      `Accounting period ${activeCompany.activePeriod} was marked as ${newStatus ? "CLOSED & LOCKED" : "OPEN"}.`,
      reason
    );
  };

  const createInvoice: AccountingContextType["createInvoice"] = (invData) => {
    if (!userPersona.canCreateJournals) {
      return { success: false, error: "Unauthorized." };
    }
    const invId = `INV-${new Date().getFullYear().toString().substr(2)}${String(currentData.invoices.length + 50).padStart(3, "0")}`;
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

    const jeLines: { accountCode: string; debit: number; credit: number; memo?: string; projectId?: string }[] = [];

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
      `Issued ${newInvoice.kind} Invoice to ${newInvoice.customerName}. Subtotal: $${newInvoice.subtotal.toFixed(2)}, Tax: $${newInvoice.taxAmount.toFixed(2)}, Total: $${newInvoice.total.toFixed(2)}.`
    );

    return { success: true, invoiceId: invId };
  };

  const recordInvoicePayment = (invoiceId: string, paymentDate: string) => {
    const inv = currentData.invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, error: "Invoice not found." };
    if (inv.status === "Paid") return { success: false, error: "Invoice is already paid." };

    const jeLines = [
      { accountCode: "1000", debit: inv.total, credit: 0, memo: `Cash receipt from ${inv.customerName} for ${inv.id}` },
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
      invoices: prev.invoices.map((i) => (i.id === invoiceId ? { ...i, status: "Paid" as const, paymentDate } : i)),
    }));

    addAuditLog("RECORD_PAYMENT", "Invoice", inv.id, `Recorded full payment of $${inv.total.toFixed(2)} clearing Accounts Receivable.`);

    return { success: true };
  };

  const createBill: AccountingContextType["createBill"] = (billData) => {
    if (!userPersona.canCreateJournals) return { success: false, error: "Unauthorized." };

    const billId = `BILL-${new Date().getFullYear().toString().substr(2)}${String(currentData.bills.length + 30).padStart(3, "0")}`;
    const usdAmount = Math.round((billData.foreignAmount / (billData.fxRate || 1.0)) * 100) / 100;

    const newBill: Bill = {
      ...billData,
      id: billId,
      usdAmount,
      status: "Open",
    };

    const jeLines: { accountCode: string; debit: number; credit: number; memo?: string; projectId?: string }[] = [];

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
            costLots: [...it.costLots, { id: `lot-${Date.now()}`, qty: invItem.qty!, unitCost, date: newBill.date }],
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

    addAuditLog("CREATE_BILL", "Bill", billId, `Entered vendor bill from ${newBill.vendorName}. USD Base: $${usdAmount.toFixed(2)}.`);

    return { success: true, billId };
  };

  const payBill = (billId: string, paymentDate: string, settlementFxRate?: number) => {
    const bill = currentData.bills.find((b) => b.id === billId);
    if (!bill) return { success: false, error: "Bill not found." };
    if (bill.status === "Paid") return { success: false, error: "Bill is already paid." };

    const effectiveSettlementRate = settlementFxRate || bill.fxRate;
    const actualCashPaidUsd = Math.round((bill.foreignAmount / effectiveSettlementRate) * 100) / 100;
    const originalApUsd = bill.usdAmount;
    const diff = Math.round((originalApUsd - actualCashPaidUsd) * 100) / 100;

    const jeLines: { accountCode: string; debit: number; credit: number; memo?: string; projectId?: string }[] = [];

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
          : b
      ),
    }));

    addAuditLog(
      "PAY_BILL",
      "Bill",
      bill.id,
      `Paid bill to ${bill.vendorName}. Cash Out: $${actualCashPaidUsd.toFixed(2)}, Realized FX Variance: $${diff.toFixed(2)}.`
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
    addAuditLog("CREATE_PROJECT", "Project", newProj.code, `Created project "${newProj.name}" with budget $${newProj.budget.toLocaleString()}.`);
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

    postJournalEntry({
      date: new Date().toISOString().split("T")[0]!,
      memo: `Physical Inventory Count Adjustment — ${item.sku}`,
      sourceType: "InventoryAdjustment",
      lines: jeLines,
    });

    updateCompanyData((prev) => ({
      ...prev,
      inventory: prev.inventory.map((i) =>
        i.id === itemId
          ? {
              ...i,
              qtyOnHand: Math.max(0, i.qtyOnHand + qtyDelta),
              costLots: isIncrease
                ? [...i.costLots, { id: `lot-${Date.now()}`, qty: qtyDelta, unitCost, date: new Date().toISOString().split("T")[0]! }]
                : i.costLots,
            }
          : i
      ),
    }));

    addAuditLog("ADJUST_STOCK", "InventoryItem", item.sku, `Adjusted stock by ${qtyDelta > 0 ? "+" : ""}${qtyDelta} units. Memo: ${memo}`);
  };

  const addInventoryItem = (itemData: Omit<InventoryItem, "id" | "costLots">) => {
    const newItem: InventoryItem = {
      ...itemData,
      id: `item-${Date.now()}`,
      costLots:
        itemData.qtyOnHand > 0
          ? [{ id: `lot-init-${Date.now()}`, qty: itemData.qtyOnHand, unitCost: itemData.unitCost, date: new Date().toISOString().split("T")[0]! }]
          : [],
    };
    updateCompanyData((prev) => ({
      ...prev,
      inventory: [...prev.inventory, newItem],
    }));
    addAuditLog("CREATE_ITEM", "InventoryItem", newItem.sku, `Added item ${newItem.sku} (${newItem.name}) to catalog.`);
  };

  const setCostMethod = (method: "FIFO" | "WeightedAverage") => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === activeCompany.id ? { ...c, costMethod: method } : c))
    );
    addAuditLog("UPDATE_COST_METHOD", "ClientCompany", activeCompany.id, `Valuation method updated to ${method}.`);
  };

  const uploadMockStatement = ({ name, type, accountCode }: { name: string; type: "CSV" | "OFX" | "PDF"; accountCode: string }) => {
    const fileId = `st-${Date.now()}`;
    const newFile: BankStatementFile = {
      id: fileId,
      fileName: name,
      accountCode,
      fileType: type,
      rowsCount: 14,
      uploadedAt: new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }) + " EST",
      uploadedBy: userPersona.name,
      status: "Pending Review",
    };

    const newStaging: StagingRow[] = [
      { id: `sr-${Date.now()}-1`, fileId, date: "2026-12-20", description: "AMZN MKTP US*HD882", amount: -284.5, suggestedAccount: "6200", status: "Pending" },
      { id: `sr-${Date.now()}-2`, fileId, date: "2026-12-21", description: "CUSTOMER WIRE INWARD", amount: 8400.0, suggestedAccount: "1100", status: "Pending" },
      { id: `sr-${Date.now()}-3`, fileId, date: "2026-12-22", description: "FLORIDA POWER & LIGHT", amount: -612.4, suggestedAccount: "6200", status: "Pending" },
    ];

    updateCompanyData((prev) => ({
      ...prev,
      statements: [newFile, ...prev.statements],
      stagingRows: [...newStaging, ...prev.stagingRows],
    }));

    addAuditLog("UPLOAD_STATEMENT", "BankStatementFile", fileId, `Uploaded ${type} statement file: ${name} to account ${accountCode}.`);
  };

  const classifyStagingRow = (rowId: string, targetAccountCode: string) => {
    const row = currentData.stagingRows.find((r) => r.id === rowId);
    if (!row) return;

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
        accountCode: "1000",
        debit: isOutflow ? 0 : absAmount,
        credit: isOutflow ? absAmount : 0,
        memo: `Bank statement feed: ${row.description}`,
      },
    ];

    postJournalEntry({
      date: row.date,
      memo: `Bank feed classification: ${row.description}`,
      sourceType: "BankStaging",
      lines: jeLines,
    });

    updateCompanyData((prev) => ({
      ...prev,
      stagingRows: prev.stagingRows.map((r) =>
        r.id === rowId ? { ...r, status: "Classified" as const, classifiedAccount: targetAccountCode } : r
      ),
    }));

    addAuditLog("CLASSIFY_STAGING", "StagingRow", rowId, `Classified staged bank transaction to Account ${targetAccountCode}.`);
  };

  const recordTaxRemittance = (taxId: string, receiptName: string) => {
    const tax = currentData.taxes.find((t) => t.id === taxId);
    if (!tax) return;

    const jeLines = [
      { accountCode: "2200", debit: tax.dueAmount, credit: 0, memo: `Tax remittance: ${tax.jurisdiction}` },
      { accountCode: "1000", debit: 0, credit: tax.dueAmount, memo: `Payment of ${tax.period} sales tax` },
    ];

    postJournalEntry({
      date: new Date().toISOString().split("T")[0]!,
      memo: `Sales Tax Remittance — ${tax.jurisdiction} (${tax.period})`,
      sourceType: "Payment",
      lines: jeLines,
    });

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
          : t
      ),
    }));

    addAuditLog("REMIT_TAX", "TaxRecord", taxId, `Remitted sales tax payment of $${tax.dueAmount.toFixed(2)} with receipt attachment ${receiptName}.`);
  };

  const addAccount = (acct: Account) => {
    updateCompanyData((prev) => ({
      ...prev,
      accounts: [...prev.accounts, acct],
    }));
    addAuditLog("CREATE_ACCOUNT", "Account", acct.code, `Added account ${acct.code} — ${acct.name} (${acct.type}).`);
  };

  const { accountBalances, totalDebitSum, totalCreditSum, isLedgerBalanced } = useMemo(() => {
    const balances: Record<string, { debit: number; credit: number; net: number }> = {};

    currentData.accounts.forEach((a) => {
      balances[a.code] = { debit: 0, credit: 0, net: 0 };
    });

    let debSum = 0;
    let credSum = 0;

    currentData.journals.forEach((j) => {
      if (j.status === "Reversed") return;
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
  }, [currentData.journals, currentData.accounts]);

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

  return (
    <AccountingContext.Provider
      value={{
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
        uploadMockStatement,
        classifyStagingRow,
        taxes: currentData.taxes,
        recordTaxRemittance,
        auditLogs: currentData.auditLogs,
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
      }}
    >
      {children}
    </AccountingContext.Provider>
  );
};

export const useAccounting = () => {
  const ctx = useContext(AccountingContext);
  if (!ctx) throw new Error("useAccounting must be used within an AccountingProvider");
  return ctx;
};
