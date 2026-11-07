import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui-kit";
import { previewBankSettlement } from "@/lib/bank-feed";
import { formatCurrency as bankMoney, editableCurrencyAmount as editableAmount } from "@/lib/format";
import { bankAmount, type BankSettlement } from "@/lib/bank-feed-model";
import { unitsAmount } from "@/lib/journal-model";
import { useAccounting } from "@/lib/accounting-store";
import {
  BankSubmit,
  DuplicateConfirmation,
  ErrorMessage,
  Field,
  SelectField,
  fieldStyle,
  type BankDetail,
  type BankRun,
} from "@/components/bank-feed-ui";

export function BankMatch({
  data,
  run,
  back,
  saved,
}: {
  data: BankDetail;
  run: BankRun;
  back: () => void;
  saved: (message: string) => void;
}) {
  const { activeCompany } = useAccounting();
  const { row, documents, moves } = data;
  const out = Number(row.amount) < 0;
  const amount = Math.abs(Number(row.amount));
  const [mode, setMode] = useState<"recorded" | "open">(
    /^(Matched to)/i.test(row.externalPosting) ? "recorded" : "open",
  );
  const [party, setParty] = useState(() => {
    const originalParty = row.fromTo.toLowerCase();
    const candidates = new Set(
      [
        ...documents.map((doc) => ({ id: doc.partyId, name: doc.name })),
        ...moves.flatMap((move) => move.party ?? []),
      ]
        .filter((item) => originalParty && item.name.toLowerCase() === originalParty)
        .map((item) => item.id || item.name),
    );
    return candidates.size === 1 ? [...candidates][0]! : "";
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(row.date);
  const [rate, setRate] = useState("");
  const [source, setSource] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [keys, setKeys] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewBankSettlement>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const filter = search.trim().toLowerCase();
  const parties = new Map<string, string>();
  for (const doc of documents) parties.set(doc.partyId || doc.name, doc.name);
  for (const move of moves)
    if (move.party) parties.set(move.party.id || move.party.name, move.party.name);
  const inRange = (value: string) => (!from || value >= from) && (!to || value <= to);
  const hits = (...values: string[]) =>
    !filter || values.some((v) => v.toLowerCase().includes(filter));
  const filteredDocs = documents.filter(
    (doc) =>
      inRange(doc.date) &&
      (!party || (doc.partyId || doc.name) === party) &&
      hits(doc.name, doc.reference),
  );
  const filteredMoves = moves.filter(
    (m) =>
      inRange(m.date) &&
      (!party || (m.party?.id || m.party?.name) === party) &&
      hits(m.reference, m.description, m.party?.name ?? ""),
  );
  const postedTotal = moves
    .filter((m) => keys.includes(m.key))
    .reduce((sum, m) => sum + bankAmount(String(m.amount), row.currency), 0n);
  const original = bankAmount(row.amount.replace(/^-/, ""), row.currency);
  const input: BankSettlement = {
    operation: "settle",
    rowId: row.id,
    date,
    confirmDuplicate: duplicate,
    rate: rate || undefined,
    rateSource: source || undefined,
    lines: Object.entries(allocations).map(([documentId, value]) => ({
      documentId,
      amount: value,
    })),
  };
  const handle = (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    void work()
      .catch(setError)
      .finally(() => setBusy(false));
  };
  const change = (id: string, value?: string) => {
    setPreview(undefined);
    setAllocations((old) => {
      const next = { ...old };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  };
  const previewValid = preview && Number(preview.difference) === 0 && Number(preview.cashBase) > 0;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "recorded") {
          handle(async () => {
            await run({ operation: "match", rowId: row.id, keys, confirmDuplicate: duplicate });
            saved("Existing movements matched to the statement.");
          });
        } else if (!preview) {
          handle(async () => {
            setPreview(
              await previewBankSettlement({ data: { companyId: activeCompany.id, input } }),
            );
          });
        } else {
          handle(async () => {
            const result = await run(input);
            saved(
              result.posted
                ? "Selected titles settled and matched to the statement."
                : "Settlement submitted for journal approval.",
            );
          });
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "open" ? "secondary" : "outline"}
          aria-pressed={mode === "open"}
          onClick={() => {
            setMode("open");
            setError(null);
          }}
        >
          {out ? "Open bills" : "Open receivables"}
        </Button>
        <Button
          type="button"
          variant={mode === "recorded" ? "secondary" : "outline"}
          aria-pressed={mode === "recorded"}
          onClick={() => {
            setMode("recorded");
            setError(null);
          }}
        >
          {out ? "Recorded payments & journals" : "Recorded receipts & journals"}
        </Button>
      </div>
      <p className="text-sm text-ink3">
        {mode === "open"
          ? "Select titles and allocate the gross amount to clear. The preview shows the net bank movement."
          : "Select posted movements to reconcile with this statement line."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          name={out ? "Supplier" : "Customer"}
          value={party}
          change={setParty}
          placeholder={out ? "All suppliers" : "All customers"}
          options={[...parties].map(([id, name]) => ({ id, name }))}
        />
        <Field name="Search">
          <input
            className={fieldStyle}
            placeholder="Document or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field name="Filter from">
          <input
            className={fieldStyle}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field name="Filter to">
          <input
            className={fieldStyle}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      {mode === "open" ? (
        <>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            <Table>
              <thead className="sticky top-0 bg-background">
                <tr>
                  <Th>Use</Th>
                  <Th>Document</Th>
                  <Th>{out ? "Supplier" : "Customer"}</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th>Currency</Th>
                  <Th align="right">Open balance</Th>
                  <Th>Apply amount</Th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => {
                  const compatible = doc.currency === row.currency;
                  return (
                    <tr className="border-t" key={doc.id}>
                      <Td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${doc.reference}`}
                          disabled={!compatible || busy}
                          checked={Object.hasOwn(allocations, doc.id)}
                          onChange={(e) =>
                            change(
                              doc.id,
                              e.target.checked
                                ? editableAmount(Math.min(doc.open, amount), row.currency)
                                : undefined,
                            )
                          }
                        />
                      </Td>
                      <Td>{doc.reference}</Td>
                      <Td>{doc.name}</Td>
                      <Td>{doc.date}</Td>
                      <Td>{doc.dueDate}</Td>
                      <Td>{doc.currency}</Td>
                      <Td align="right">{bankMoney(doc.open, doc.currency)}</Td>
                      <Td>
                        {Object.hasOwn(allocations, doc.id) ? (
                          <input
                            aria-label={`Amount for ${doc.reference}`}
                            className={fieldStyle + " w-32"}
                            required
                            inputMode="decimal"
                            disabled={busy}
                            value={allocations[doc.id]}
                            onChange={(e) => change(doc.id, e.target.value)}
                          />
                        ) : !compatible ? (
                          "Different currency"
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  );
                })}
                {!filteredDocs.length && (
                  <tr>
                    <Td colSpan={8}>No open documents for these filters.</Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field name="Settlement date">
              <input
                required
                className={fieldStyle}
                type="date"
                disabled={busy}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPreview(undefined);
                }}
              />
            </Field>
            {row.currency !== "USD" && (
              <>
                <Field name={`Rate · USD per ${row.currency}`}>
                  <input
                    required
                    className={fieldStyle}
                    inputMode="decimal"
                    disabled={busy}
                    value={rate}
                    onChange={(e) => {
                      setRate(e.target.value);
                      setPreview(undefined);
                    }}
                  />
                </Field>
                <Field name="Rate source">
                  <input
                    required
                    className={fieldStyle}
                    disabled={busy}
                    value={source}
                    onChange={(e) => {
                      setSource(e.target.value);
                      setPreview(undefined);
                    }}
                  />
                </Field>
              </>
            )}
          </div>
          <p className="text-sm">
            {Object.keys(allocations).length} selected · Gross{" "}
            {bankMoney(
              Object.values(allocations).reduce((sum, value) => sum + (Number(value) || 0), 0),
              row.currency,
            )}
          </p>
          {preview && (
            <div className="space-y-2 rounded-md border p-3">
              <Table>
                <thead>
                  <tr>
                    <Th>Title</Th>
                    <Th>Applied</Th>
                    <Th>Discount</Th>
                    <Th>Net</Th>
                    <Th>Remaining</Th>
                    <Th>Net (USD)</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.allocations.map((quote) => (
                    <tr key={quote.documentId}>
                      <Td>
                        {documents.find((d) => d.id === quote.documentId)?.reference ??
                          quote.documentId}
                      </Td>
                      <Td>{bankMoney(quote.amount, row.currency)}</Td>
                      <Td>{bankMoney(quote.discountAmount, row.currency)}</Td>
                      <Td>{bankMoney(quote.cashAmount, row.currency)}</Td>
                      <Td>{bankMoney(quote.remaining, row.currency)}</Td>
                      <Td>{bankMoney(quote.cashFunctionalAmount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className="text-sm">
                Net {bankMoney(preview.cash, row.currency)} · Bank {bankMoney(amount, row.currency)}{" "}
                ·{" "}
                <strong className={previewValid ? "" : "text-down"}>
                  Difference {bankMoney(preview.difference, row.currency)}
                </strong>{" "}
                · {bankMoney(preview.cashBase)} USD
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <thead className="sticky top-0 bg-background">
                <tr>
                  <Th>Use</Th>
                  <Th>Journal / document</Th>
                  <Th>{out ? "Supplier" : "Customer"}</Th>
                  <Th>Recorded</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {filteredMoves.map((move) => (
                  <tr key={move.key} className="border-t">
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Match ${move.reference}`}
                        disabled={busy}
                        checked={keys.includes(move.key)}
                        onChange={(e) =>
                          setKeys(
                            e.target.checked
                              ? [...keys, move.key]
                              : keys.filter((key) => key !== move.key),
                          )
                        }
                      />
                    </Td>
                    <Td>
                      <strong>{move.reference}</strong>
                      {move.party && <div>{move.party.reference}</div>}
                      <div className="max-w-72 truncate text-xs text-ink3" title={move.description}>
                        {move.description}
                      </div>
                    </Td>
                    <Td>{move.party?.name || "—"}</Td>
                    <Td>{move.date}</Td>
                    <Td>{move.issueDate || "—"}</Td>
                    <Td>{move.dueDate || "—"}</Td>
                    <Td align="right">
                      {bankMoney(move.amount, row.currency)} {row.currency}
                    </Td>
                  </tr>
                ))}
                {!filteredMoves.length && (
                  <tr>
                    <Td colSpan={7}>No available posted movements for these filters.</Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
          <p className="text-sm">
            {keys.length} selected · {bankMoney(unitsAmount(postedTotal), row.currency)} of{" "}
            {bankMoney(amount, row.currency)}
          </p>
        </>
      )}
      <DuplicateConfirmation row={row} checked={duplicate} change={setDuplicate} />
      <ErrorMessage error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={back}>
          Back to Categorize
        </Button>
        {mode === "recorded" ? (
          <BankSubmit
            busy={busy}
            disabled={!keys.length || postedTotal !== original || (row.duplicate && !duplicate)}
          >
            Confirm match
          </BankSubmit>
        ) : (
          <BankSubmit
            busy={busy}
            disabled={
              !input.lines.length ||
              input.lines.some((l) => !l.amount) ||
              (preview ? !previewValid || (row.duplicate && !duplicate) : false)
            }
          >
            {preview ? "Confirm settlement" : "Preview settlement"}
          </BankSubmit>
        )}
      </div>
    </form>
  );
}
