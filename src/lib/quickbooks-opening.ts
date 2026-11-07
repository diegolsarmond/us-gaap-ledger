import { amountUnits, unitsAmount, type JournalInput } from "./journal-model";

type Account = {
  code: string;
  name: string;
  type: string;
  parentCode?: string | undefined;
  sourceAccount?: { currency: string; balance?: number | undefined } | undefined;
};

const balanceSheet = new Set(["Asset", "Liability", "Equity"]);
const units = (value: number) => {
  const text = Math.abs(value).toFixed(4);
  return (value < 0 ? -1n : 1n) * amountUnits(text);
};
const money = (value: bigint) => unitsAmount(value < 0n ? -value : value);

/**
 * Opening journal lines from the balances imported with the QuickBooks Account List.
 *
 * QuickBooks reports balances debit-positive and a parent's "Total balance" already includes
 * its subaccounts, so only analytical (leaf) accounts are posted. Parents whose own balance
 * differs from their subaccounts cannot be posted (journals reject parent accounts) and are
 * reported instead. Foreign-currency balances are left out: the export does not say whether
 * they are in the account currency or in USD. The Account List has no P&L history, so the
 * difference — the result accumulated up to the migration date — balances to Retained Earnings.
 */
export function quickBooksOpening(accounts: readonly Account[], functionalCurrency = "USD") {
  const parents = new Set(accounts.flatMap((a) => (a.parentCode ? [a.parentCode] : [])));
  const balance = (a: Account) => units(a.sourceAccount?.balance ?? 0);
  const imported = accounts.filter(
    (a) => balanceSheet.has(a.type) && a.sourceAccount?.balance !== undefined,
  );
  const lines: JournalInput["lines"] = [];
  const foreign: { code: string; name: string; currency: string; balance: string }[] = [];
  let total = 0n;
  for (const account of imported) {
    if (parents.has(account.code)) continue;
    const amount = balance(account);
    if (amount === 0n) continue;
    if (account.sourceAccount!.currency !== functionalCurrency) {
      foreign.push({
        code: account.code,
        name: account.name,
        currency: account.sourceAccount!.currency,
        balance: unitsAmount(amount),
      });
      continue;
    }
    total += amount;
    lines.push({
      accountCode: account.code,
      description: "QuickBooks opening balance",
      debit: amount > 0n ? money(amount) : "0",
      credit: amount < 0n ? money(amount) : "0",
    });
  }
  const unbalancedParents = imported.flatMap((parent) => {
    if (!parents.has(parent.code)) return [];
    const children = accounts
      .filter((a) => a.parentCode === parent.code)
      .reduce((sum, child) => sum + balance(child), 0n);
    const residual = balance(parent) - children;
    return residual === 0n
      ? []
      : [{ code: parent.code, name: parent.name, residual: unitsAmount(residual) }];
  });
  const equity = accounts.filter((a) => a.type === "Equity" && !parents.has(a.code));
  const retainedEarnings =
    equity.find((a) => /retained earnings/i.test(a.name)) ??
    equity.find((a) => /opening balance equity/i.test(a.name));
  if (total !== 0n && retainedEarnings)
    lines.push({
      accountCode: retainedEarnings.code,
      description: "Result accumulated through the migration date (not in the Account List)",
      debit: total < 0n ? money(total) : "0",
      credit: total > 0n ? money(total) : "0",
    });
  return {
    lines,
    retainedEarnings: retainedEarnings?.code ?? null,
    /** Debit-positive balance-sheet total: positive is accumulated profit, negative a loss. */
    accumulatedResult: unitsAmount(total),
    foreign,
    unbalancedParents,
  };
}
