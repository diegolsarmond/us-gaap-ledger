import { createAccountingEngine, type CompanyState, type UserPersona } from "./accounting-engine";
import type { Company } from "./company-model";
import { fetchTransactionRate } from "./transaction-rates";
import { normalizedFx, outstanding } from "./transaction-fx";
export async function revalueAtClose(
  state: CompanyState,
  company: Company,
  user: UserPersona,
  date: string,
) {
  const candidates = [
    ...state.bills.map((doc) => ({ doc, kind: "AP" })),
    ...state.invoices.map((doc) => ({ doc, kind: "AR" })),
  ];
  const codes = [
    ...new Set(
      candidates
        .filter(
          ({ doc, kind }) =>
            outstanding(doc, date).native > 0 &&
            !state.journals.some(
              (j) =>
                j.sourceType === "FXRevaluation" && j.sourceId === kind + ":" + doc.id + ":" + date,
            ),
        )
        .map(({ doc }) => normalizedFx(doc).transactionCurrency),
    ),
  ].filter((c) => c !== "USD");
  if (!codes.length) return state;
  const quotes = Object.fromEntries(
    await Promise.all(codes.map(async (c) => [c, await fetchTransactionRate(c, date)])),
  );
  const engine = createAccountingEngine(state, company, { ...user, canCreateJournals: true });
  const result = engine.value.revalueOpenItems(date, quotes);
  if (!result.success) throw new Error(result.error);
  return engine.getState();
}
