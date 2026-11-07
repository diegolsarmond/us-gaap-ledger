import { postingRoles } from "./posting-accounts";
import { validateCoa } from "./coa";
import { validateDimensionDefinitions, validateDimensionValues } from "./dimensions";
import { importCatalog, type ImportDomain } from "./bulk-import";
import { validateCustomers } from "./customer-model";
import { db } from "./db.server";
import { authorizeCompany, setActor } from "./companies.server";
import {
  createAccountingEngine,
  createInitialCompanyData,
  type CompanyState,
  type UserPersona,
} from "./accounting-engine";
import { commandArgs, domains, type AccountingCommand } from "./accounting-model";
import type { PoolClient } from "pg";
import { readLedger, readLedgerDomains, replaceLedger } from "./ledger-storage.server";
import { normalizedFx, money } from "./transaction-fx";
import { revalueAtClose } from "./fx-close.server";
import type { ContactUsage } from "./contact-usage";

export function persona(
  user: { name: string },
  permissions: { write_accounting: boolean; close_periods: boolean; manage_users: boolean },
): UserPersona {
  return {
    name: user.name,
    title: "Usuário autenticado",
    role: permissions.write_accounting ? "accounting_staff" : "client_portal",
    allowedReportsOnly: !permissions.write_accounting,
    canCreateJournals: permissions.write_accounting,
    canClosePeriod: permissions.close_periods,
    canManageUsers: permissions.manage_users,
  };
}
export async function readState(companyId: string, client: Pick<PoolClient, "query"> = db()) {
  const state = createInitialCompanyData();
  Object.assign(state, await readLedgerDomains(client, companyId, domains));
  return state;
}
export async function load(companyId: string) {
  const client = await db().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const auth = await authorizeCompany(companyId, undefined, client);
    const state = await readState(companyId, client);
    const revision = await client.query("SELECT revision FROM companies WHERE id=$1", [companyId]);
    await client.query("COMMIT");
    return { state, company: auth.company, revision: revision.rows[0].revision as number };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function cashAccountLinks(
  companyId: string,
): Promise<{ code: string; planned: number; realized: number; cancelled: number }[]> {
  await authorizeCompany(companyId);
  // Cash forecasts naming the account as cash account or as counterpart (category).
  const result = await db().query(
    `SELECT code,count(*) FILTER(WHERE status='planned')::int AS planned,
       count(*) FILTER(WHERE status='realized')::int AS realized,
       count(*) FILTER(WHERE status='cancelled')::int AS cancelled
     FROM (SELECT account_code AS code,status FROM cash_forecasts WHERE company_id=$1
           UNION ALL SELECT counterpart_code,status FROM cash_forecasts WHERE company_id=$1 AND transfer_id IS NULL) links
     GROUP BY code ORDER BY code`,
    [companyId],
  );
  return result.rows;
}

/** Counts records outside the ledger state that reference customers or vendors. Callers authorize. */
export async function contactUsage(
  companyId: string,
  connection: Pick<PoolClient, "query"> = db(),
  id?: string,
): Promise<ContactUsage> {
  const [lines, files] = await Promise.all([
    connection.query(
      `SELECT 'customers' AS domain,customer_id AS id,count(*)::int AS n FROM journal_entry_lines
        WHERE company_id=$1 AND customer_id IS NOT NULL AND ($2::text IS NULL OR customer_id=$2) GROUP BY customer_id
       UNION ALL
       SELECT 'vendors',vendor_id,count(*)::int FROM journal_entry_lines
        WHERE company_id=$1 AND vendor_id IS NOT NULL AND ($2::text IS NULL OR vendor_id=$2) GROUP BY vendor_id`,
      [companyId, id ?? null],
    ),
    connection.query(
      "SELECT vendor_id AS id,count(*)::int AS n FROM vendor_attachments WHERE company_id=$1 AND ($2::text IS NULL OR vendor_id=$2) GROUP BY vendor_id",
      [companyId, id ?? null],
    ),
  ]);
  const usage: ContactUsage = { customers: {}, vendors: {} };
  for (const row of lines.rows) {
    if (row.domain === "customers") usage.customers[row.id] = { journalLines: row.n };
    else usage.vendors[row.id] = { journalLines: row.n, attachments: 0 };
  }
  for (const row of files.rows)
    usage.vendors[row.id] = {
      journalLines: usage.vendors[row.id]?.journalLines ?? 0,
      attachments: row.n,
    };
  return usage;
}

export function validateState(state: CompanyState) {
  validateDimensionDefinitions(state.dimensions);
  for (const doc of [...state.invoices, ...state.bills, ...state.journals])
    validateDimensionValues(
      state.dimensions,
      doc.dimensionValues,
      "items" in doc ? doc.items.map((i) => i.id) : doc.lines.map((l) => l.id),
    );
  validateCoa(state.accounts);
  validateCustomers(
    state.customers,
    state.currencies.map((c) => c.code),
    state.paymentTerms.map((t) => t.id),
    state.taxJurisdictions.map((t) => t.code),
  );
  const accounts = new Set(state.accounts.map((a) => a.code));
  const projects = new Set(state.projects.map((p) => p.id));
  const files = new Set(state.statements.map((s) => s.id));
  const skus = new Set(state.inventory.map((i) => i.sku));
  const refs: {
    source_domain: string;
    source_id: string;
    account_id: string | null;
    project_id: string | null;
    statement_id: string | null;
  }[] = [];
  const ref = (domain: string, id: string, account?: string, project?: string, file?: string) => {
    if (account && !accounts.has(account))
      throw new Error(`Cadastre a conta contábil ${account} antes de operar.`);
    if (project && !projects.has(project)) throw new Error("Projeto não pertence à empresa.");
    if (file && !files.has(file)) throw new Error("Extrato não pertence à empresa.");
    refs.push({
      source_domain: domain,
      source_id: id,
      account_id: account || null,
      project_id: project || null,
      statement_id: file || null,
    });
  };
  for (const domain of domains) {
    const keys = (state[domain] as unknown as Record<string, unknown>[]).map((r) =>
      String(domain === "accounts" || domain === "currencies" ? r["code"] : r["id"]),
    );
    if (new Set(keys).size !== keys.length) throw new Error(`Registro duplicado em ${domain}.`);
  }
  if (skus.size !== state.inventory.length) throw new Error("SKU duplicado.");
  for (const j of state.journals) {
    if (j.lines.length < 2 || Math.abs(j.lines.reduce((s, l) => s + l.debit - l.credit, 0)) > 0.005)
      throw new Error("Lançamento contábil desbalanceado.");
    for (const l of j.lines) {
      if (
        !Number.isFinite(l.debit) ||
        !Number.isFinite(l.credit) ||
        l.debit < 0 ||
        l.credit < 0 ||
        (l.debit > 0 && l.credit > 0)
      )
        throw new Error("Débito/crédito inválido.");
      ref("journals", j.id, l.accountCode, l.projectId);
    }
  }
  for (const s of state.statements) ref("statements", s.id, s.accountCode);
  for (const s of state.stagingRows)
    ref("stagingRows", s.id, s.classifiedAccount, undefined, s.fileId);
  for (const doc of [
    ...state.invoices,
    ...state.bills,
    ...state.journals.flatMap((j) => j.lines),
  ]) {
    if (doc.costCenterId && !state.costCenters.some((c) => c.id === doc.costCenterId))
      throw new Error("Cost center does not belong to this company.");
  }
  for (const i of state.invoices) {
    const fx = normalizedFx(i);
    if (money(i.total) !== fx.transactionAmount)
      throw new Error("Invoice transaction amount must equal its total.");
    if (i.customerId && !state.customers.some((c) => c.id === i.customerId))
      throw new Error("Customer does not belong to this company.");
    if (
      i.projectId &&
      i.customerId &&
      state.projects.some(
        (p) => p.id === i.projectId && p.customerId && p.customerId !== i.customerId,
      )
    )
      throw new Error("Project belongs to another customer.");
    ref("invoices", i.id, undefined, i.projectId);
    const subtotal = Math.round(i.items.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100;
    const taxable = i.items.filter((l) => l.taxable).reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const tax = i.taxExempt ? 0 : Math.round(taxable * i.taxRate) / 100;
    if (
      Math.abs(i.subtotal - subtotal) > 0.011 ||
      Math.abs(i.taxAmount - tax) > 0.011 ||
      Math.abs(i.total - i.subtotal - i.taxAmount) > 0.011
    )
      throw new Error("Totais da fatura inválidos.");
    for (const l of i.items)
      if (l.isProduct && (!l.sku || !skus.has(l.sku)))
        throw new Error("Produto não pertence à empresa.");
  }
  for (const v of state.vendors) {
    ref("vendors", v.id, v.defaultExpenseAccountCode);
    if (
      v.defaultExpenseAccountCode &&
      !state.accounts.some(
        (a) =>
          a.code === v.defaultExpenseAccountCode &&
          ["COGS", "Operating Expense", "Other Expense"].includes(a.type),
      )
    )
      throw new Error("Select an expense account.");
    if (v.paymentTermId && !state.paymentTerms.some((t) => t.id === v.paymentTermId))
      throw new Error("Payment term does not belong to this company.");
  }
  for (const b of state.bills) {
    const fx = normalizedFx(b);
    if (
      fx.transactionCurrency !== b.currency ||
      fx.transactionAmount !== money(b.foreignAmount) ||
      fx.exchangeRateValue !== b.fxRate ||
      fx.functionalAmount !== money(b.usdAmount)
    )
      throw new Error("Bill currency fields are inconsistent.");
    if (b.vendorId && !state.vendors.some((v) => v.id === b.vendorId))
      throw new Error("Vendor does not belong to this company.");
    for (const payment of b.payments || [])
      if (
        payment.bankAccountId &&
        !state.vendors
          .find((v) => v.id === b.vendorId)
          ?.bankAccounts?.some((a) => a.id === payment.bankAccountId)
      )
        throw new Error("A bank account used by a payment must remain linked to its vendor.");
    ref("bills", b.id, undefined, b.projectId);
    if (Math.abs(b.items.reduce((s, l) => s + l.amount, 0) - b.usdAmount) > 0.011)
      throw new Error("Total da conta a pagar inválido.");
    for (const l of b.items) {
      ref("bills", b.id, l.accountCode, l.projectId);
      if (l.isInventory && (!l.sku || !skus.has(l.sku)))
        throw new Error("Estoque não pertence à empresa.");
    }
  }
  for (const p of state.projects)
    if (p.customerId && !state.customers.some((c) => c.id === p.customerId))
      throw new Error("Project customer does not belong to this company.");
  for (const c of state.currencies)
    if (c.code === "USD" ? !c.isBaseCurrency || c.status !== "Active" : c.isBaseCurrency)
      throw new Error("USD é a única moeda base, com paridade 1.");
  for (const domain of [
    "paymentTerms",
    "costCenters",
    "expenseCategories",
    "taxJurisdictions",
    "projects",
  ] as const) {
    const codes = state[domain].map((r) => r.code);
    if (new Set(codes).size !== codes.length) throw new Error("Código duplicado.");
  }
  for (const p of [...state.expenseCategories, ...state.taxJurisdictions, ...state.postingAccounts])
    ref("parameters", p.id, p.glAccountCode);
  for (const flag of ["isDefaultCustomer", "isDefaultVendor"] as const)
    if (state.paymentTerms.filter((t) => t[flag]).length > 1)
      throw new Error("Only one default payment term is allowed per company and role.");
  const roles = new Set<string>();
  for (const mapping of state.postingAccounts) {
    if (roles.has(mapping.code)) throw new Error("Each posting role can have only one mapping.");
    roles.add(mapping.code);
    if (
      state.accounts.find((a) => a.code === mapping.glAccountCode)?.type !==
      postingRoles[mapping.code]?.type
    )
      throw new Error("Posting account classification does not match its role.");
  }
  const periods = [...state.fiscalPeriods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 0; i < periods.length; i++)
    if (
      periods[i]!.startDate > periods[i]!.endDate ||
      (i > 0 && periods[i - 1]!.endDate >= periods[i]!.startDate)
    )
      throw new Error("Períodos fiscais inválidos ou sobrepostos.");
  return refs;
}
export async function execute(
  input: {
    companyId: string;
    revision: number;
    command: string;
    args: unknown[];
  },
  batch?: { rows: unknown[][]; preview: boolean },
) {
  if (!Object.hasOwn(commandArgs, input.command)) throw new Error("Operação inválida.");
  const command = input.command as AccountingCommand;
  if (command === "postJournalEntry" || command === "reverseJournalEntry")
    throw new Error("Use the Journal Entries posting engine.");
  if (command === "importStatement" || command === "classifyStagingRow")
    throw new Error("Use the Bank Feed operations.");
  // Optional positional arguments omitted by JSON serialization still have stable tuple positions.
  const raw = [...input.args];
  const schema = commandArgs[command];
  while (raw.length < schema.items.length) raw.push(undefined);
  const args = schema.parse(raw);
  const permission = [
    "togglePeriodLock",
    "addFiscalPeriod",
    "updateFiscalPeriod",
    "deleteFiscalPeriod",
    "resetParametersToDefault",
    "revalueOpenItems",
  ].includes(command)
    ? "close_periods"
    : "write_accounting";
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    // Shared with profile/user edits so authorization cannot be revoked during a write.
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(input.companyId, permission, client);
    const locked = await client.query("SELECT revision FROM companies WHERE id=$1 FOR UPDATE", [
      input.companyId,
    ]);
    if (locked.rows[0].revision !== input.revision)
      throw new Error(
        "Os dados foram alterados em outra sessão. Atualize a página e tente novamente.",
      );
    await setActor(client, auth.user.id);
    let state = await readState(input.companyId, client);
    let closingDate: string | undefined;
    if (
      command === "updateFiscalPeriod" &&
      (args[1] as { status?: string }).status &&
      (args[1] as { status?: string }).status !== "Open"
    )
      closingDate = state.fiscalPeriods.find(
        (p) => p.id === args[0] && p.status === "Open",
      )?.endDate;
    if (command === "togglePeriodLock" && !auth.company.isPeriodClosed) {
      closingDate = state.fiscalPeriods.find(
        (p) => p.periodCode === auth.company.activePeriod,
      )?.endDate;
      if (
        !closingDate &&
        [...state.bills, ...state.invoices].some(
          (d) => normalizedFx(d).transactionCurrency !== "USD" && d.status !== "Paid",
        )
      )
        throw new Error(
          "Close the specific fiscal period before applying a company-wide lock to foreign open items.",
        );
    }
    if (closingDate)
      state = await revalueAtClose(
        state,
        auth.company,
        persona(auth.user, auth.permissions),
        closingDate,
      );
    if (command === "deleteCustomer" || command === "deleteVendor") {
      const usage = (await contactUsage(input.companyId, client, String(args[0])))[
        command === "deleteCustomer" ? "customers" : "vendors"
      ][String(args[0])] as { journalLines: number; attachments?: number } | undefined;
      if (usage?.journalLines || usage?.attachments)
        throw new Error(
          "This record has journal lines or stored attachments and cannot be deleted.",
        );
    }
    if (command === "deleteAccount" || command === "updateAccount") {
      const code = String(args[0]);
      const linked = await client.query(
        `SELECT
        EXISTS(SELECT 1 FROM cash_forecasts WHERE company_id=$1 AND account_code=$2) AS bank,
        EXISTS(SELECT 1 FROM cash_forecasts WHERE company_id=$1 AND (account_code=$2 OR counterpart_code=$2)) AS movement`,
        [input.companyId, code],
      );
      // Actual cash lives in posted journals, which protect their own accounts.
      const usage = linked.rows[0];
      if (command === "deleteAccount" && (usage.bank || usage.movement))
        throw new Error(
          "Esta conta está vinculada a forecasts do fluxo de caixa e não pode ser excluída.",
        );
      if (command === "updateAccount") {
        const changes = args[1] as { type: string; balanceType: string };
        if (usage.bank && changes.type !== "Asset")
          throw new Error(
            "Contas com forecasts de caixa/banco devem permanecer classificadas como Asset.",
          );
      }
    }
    let engine = createAccountingEngine(state, auth.company, persona(auth.user, auth.permissions));

    let result: unknown;
    for (const [index, row] of (batch?.rows ?? [args]).entries()) {
      try {
        if (batch) {
          const domain = (Object.keys(importCatalog) as ImportDomain[]).find(
            (key) => importCatalog[key].command === command,
          );
          if (!domain || domain === "companies")
            throw new Error("This data type cannot be imported.");
          const key =
            domain === "customers" || domain === "vendors"
              ? "displayName"
              : domain === "fiscalPeriods"
                ? "periodCode"
                : "code";
          const candidate = row[0] as Record<string, unknown>;
          const existing = engine.getState()[domain] as unknown as Record<string, unknown>[];
          if (
            existing.some(
              (record) =>
                String(record[key]).trim().toLowerCase() ===
                String(candidate[key]).trim().toLowerCase(),
            )
          )
            throw new Error(`Record already exists: ${candidate[key]}.`);
        }
        const operation = engine.value[command] as (...a: unknown[]) => unknown;
        result = operation(...schema.parse(row));
        if (result && typeof result === "object" && "success" in result && !result.success)
          throw new Error(String("error" in result ? result.error : "Operação recusada."));
        if (batch) {
          validateState(engine.getState());
          engine = createAccountingEngine(
            engine.getState(),
            engine.getCompany(),
            persona(auth.user, auth.permissions),
          );
        }
      } catch (error) {
        throw new Error(
          (batch ? "Row " + (index + 2) + ": " : "") +
            (error instanceof Error ? error.message : "Registro inválido."),
        );
      }
    }
    if (result && typeof result === "object" && "success" in result && !result.success)
      throw new Error(String("error" in result ? result.error : "Operação recusada."));
    const next = engine.getState();
    const refs = validateState(next);
    const rules = await client.query("SELECT * FROM journal_account_rules WHERE company_id=$1", [
      input.companyId,
    ]);
    for (const domain of ["invoices", "bills"] as const) {
      const priorIds = new Set(state[domain].map((d) => d.id));
      for (const doc of next[domain].filter((d) => !priorIds.has(d.id))) {
        const currency = normalizedFx(doc).transactionCurrency;
        if (!next.currencies.some((c) => c.code === currency && c.status === "Active"))
          throw new Error("Select an active company currency in System Parameters.");
      }
    }
    const priorJournalIds = new Set(state.journals.map((j) => j.id));
    for (const journal of next.journals.filter((j) => !priorJournalIds.has(j.id))) {
      for (const line of journal.lines) {
        const rule = rules.rows.find((r) => r.account_code === line.accountCode);
        if (
          rule &&
          (!rule.active ||
            !rule.posting_allowed ||
            (rule.valid_from &&
              journal.date <
                String(
                  rule.valid_from instanceof Date
                    ? rule.valid_from.toISOString().slice(0, 10)
                    : rule.valid_from,
                )) ||
            (rule.valid_to &&
              journal.date >
                String(
                  rule.valid_to instanceof Date
                    ? rule.valid_to.toISOString().slice(0, 10)
                    : rule.valid_to,
                )))
        )
          throw new Error("Posting account is inactive, restricted or outside its validity dates.");
        if (rule?.cost_center_required && !line.costCenterId)
          throw new Error("A cost center is required for this posting account.");
        if (
          line.costCenterId &&
          !next.costCenters.some((c) => c.id === line.costCenterId && c.status === "Active")
        )
          throw new Error("Select an active cost center.");
      }
    }
    if (batch?.preview) {
      await client.query("ROLLBACK");
      return {
        state: next,
        company: engine.getCompany(),
        revision: input.revision,
        result: { success: true, count: batch.rows.length },
      };
    }
    // Preserve posted journals; only the engine's explicit reversal may change their status.
    await client.query("DELETE FROM ledger_references WHERE company_id=$1", [input.companyId]);
    for (const domain of domains) {
      if (domain === "statements" || domain === "stagingRows") continue;
      const values = next[domain] as unknown as Record<string, unknown>[];
      await replaceLedger(client, input.companyId, domain, values);
    }
    for (const r of refs)
      await client.query(
        "INSERT INTO ledger_references(company_id,source_domain,source_id,account_id,project_id,statement_id) VALUES($1,$2,$3,$4,$5,$6)",
        [input.companyId, r.source_domain, r.source_id, r.account_id, r.project_id, r.statement_id],
      );
    const company = engine.getCompany();
    const updated = await client.query(
      "UPDATE companies SET revision=revision+1,cost_method=$2,period_closed=$3,active_period=$4 WHERE id=$1 RETURNING revision",
      [input.companyId, company.costMethod, company.isPeriodClosed, company.activePeriod],
    );
    const beforeChanges: Record<string, unknown> = {};
    const afterChanges: Record<string, unknown> = {};
    for (const domain of domains) {
      if (domain === "auditLogs") continue;
      const previous = state[domain] as unknown as Record<string, unknown>[];
      const following = next[domain] as unknown as Record<string, unknown>[];
      const key = (row: Record<string, unknown>) => String(row["id"] ?? row["code"]);
      const oldRows = new Map(previous.map((row) => [key(row), row]));
      const newRows = new Map(following.map((row) => [key(row), row]));
      const changed = [...new Set([...oldRows.keys(), ...newRows.keys()])].filter(
        (id) => JSON.stringify(oldRows.get(id)) !== JSON.stringify(newRows.get(id)),
      );
      if (changed.length) {
        beforeChanges[domain] = Object.fromEntries(
          changed.map((id) => [id, oldRows.get(id) ?? null]),
        );
        afterChanges[domain] = Object.fromEntries(
          changed.map((id) => [id, newRows.get(id) ?? null]),
        );
      }
    }
    const accountCommand = ["addAccount", "updateAccount", "deleteAccount"].includes(command);
    const accountCode = accountCommand
      ? command === "addAccount"
        ? (args[0] as { code: string }).code
        : String(args[0])
      : null;
    await client.query(
      "INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,company_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        auth.user.id,
        auth.user.name,
        batch ? `bulkImport:${command}:${batch.rows.length}` : command,
        accountCommand ? "Account" : "Accounting",
        accountCode ?? input.companyId,
        input.companyId,
        JSON.stringify(beforeChanges),
        JSON.stringify(afterChanges),
      ],
    );
    await client.query("COMMIT");
    return {
      state: next,
      company,
      revision: updated.rows[0].revision as number,
      result: result ?? { success: true },
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
