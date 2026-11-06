import type { Account, JournalEntry } from "./accounting-engine";
import { accountAmount } from "./coa";
import { effectiveDimensions } from "./dimensions";
export type ReportFilters = {
  from?: string;
  to?: string;
  costCenterId?: string;
  dimensions?: Record<string, string>;
};
export function reportRows(
  accounts: Account[],
  journals: JournalEntry[],
  asOf?: string,
  projectId?: string,
  filters: ReportFilters = {},
) {
  const balances: Record<string, { debit: number; credit: number }> = {};
  // Reversals are separate balancing entries; keep both original and reversal.
  for (const journal of journals) {
    if (asOf && journal.date > asOf) continue;
    if ((filters.from && journal.date < filters.from) || (filters.to && journal.date > filters.to))
      continue;
    for (const line of journal.lines) {
      if (projectId && line.projectId !== projectId) continue;
      if (filters.costCenterId && (line.costCenterId ?? "__unassigned") !== filters.costCenterId)
        continue;
      const selections = effectiveDimensions(journal.dimensionValues, line.id);
      if (
        Object.entries(filters.dimensions ?? {}).some(
          ([id, value]) =>
            value &&
            (selections.find((v) => v.dimensionId === id)?.valueId ?? "__unclassified") !== value,
        )
      )
        continue;
      const b = (balances[line.accountCode] ||= { debit: 0, credit: 0 });
      b.debit += line.debit;
      b.credit += line.credit;
    }
  }
  return [...accounts]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => ({ ...a, amount: Math.round(accountAmount(a, balances) * 100) / 100 }));
}
