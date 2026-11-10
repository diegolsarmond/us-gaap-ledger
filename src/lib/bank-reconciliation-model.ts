import { z } from "zod";
import { amountUnits, unitsAmount } from "./journal-model";

const id = z.string().trim().min(1).max(200);
const date = z.string().date();
const signed = z
  .string()
  .regex(/^-?\d{1,14}(\.\d{1,4})?$/, "Enter an amount with up to 4 decimals.");

export const reconciliationStatuses = ["draft", "in_progress", "completed", "reopened"] as const;
export type ReconciliationStatus = (typeof reconciliationStatuses)[number];

export const reconciliationScope = z.object({ companyId: z.string().uuid() });
export const reconciliationRef = reconciliationScope.extend({ id: z.string().uuid() });
export const reconciliationCreate = reconciliationScope.extend({
  account: id,
  periodStart: date,
  periodEnd: date,
  statementEndingBalance: signed,
  /** Only used for an account's first reconciliation; later ones carry the previous ending balance. */
  beginningBalance: signed.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const reconciliationUpdate = reconciliationRef.extend({
  statementEndingBalance: signed.optional(),
  beginningBalance: signed.optional(),
  periodEnd: date.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const reconciliationToggle = reconciliationRef.extend({
  rowIds: z.array(id).min(1).max(5000),
  cleared: z.boolean(),
});
export const reconciliationReopen = reconciliationRef.extend({
  reason: z.string().trim().min(1).max(1000),
});

/** Exact signed amount in 1/10000 units, so live totals never drift with floating point. */
export function signedUnits(value: string): bigint {
  return value.startsWith("-") ? -amountUnits(value.slice(1)) : amountUnits(value);
}

export function reconciliationTotals(
  beginningBalance: string,
  statementEndingBalance: string,
  clearedAmounts: string[],
) {
  const cleared = clearedAmounts.reduce((sum, amount) => sum + signedUnits(amount), 0n);
  const clearedBalance = signedUnits(beginningBalance) + cleared;
  return {
    clearedTotal: unitsAmount(cleared),
    clearedBalance: unitsAmount(clearedBalance),
    difference: unitsAmount(signedUnits(statementEndingBalance) - clearedBalance),
  };
}

export const reconciliationStatusLabel: Record<ReconciliationStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  completed: "Completed",
  reopened: "Reopened",
};
