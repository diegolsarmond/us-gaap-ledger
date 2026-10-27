import type { Account, JournalEntry } from "./accounting-engine";
import { accountAmount } from "./coa";
export function reportRows(
  accounts: Account[],
  journals: JournalEntry[],
  asOf?: string,
  projectId?: string,
) {
  const balances: Record<string, { debit: number; credit: number }> = {};
  // Reversals are separate balancing entries; keep both original and reversal.
  for (const journal of journals) {
    if (asOf && journal.date > asOf) continue;
    for (const line of journal.lines) {
      if (projectId && line.projectId !== projectId) continue;
      const b = (balances[line.accountCode] ||= { debit: 0, credit: 0 });
      b.debit += line.debit;
      b.credit += line.credit;
    }
  }
  return [...accounts]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => ({ ...a, amount: Math.round(accountAmount(a, balances) * 100) / 100 }));
}
