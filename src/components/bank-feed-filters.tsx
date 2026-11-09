import { useState } from "react";
import { ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Field, SelectField, fieldStyle } from "@/components/bank-feed-ui";
import {
  bankFilterFields,
  bankTextFilters,
  emptyBankFilters,
  type BankAdvancedFilters,
  type BankAmountField,
  type BankFilterOptions,
} from "@/lib/bank-feed-filters";

export function BankFeedFilters({
  value,
  options,
  change,
  splitAmount,
}: {
  value: BankAdvancedFilters;
  options: BankFilterOptions;
  change: (value: BankAdvancedFilters) => void;
  splitAmount: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const { amount, ...fields } = value;
  const count =
    Object.values(fields).filter((field) => field.trim()).length +
    Number(Boolean(amount.min || amount.max));
  const amountFields: BankAmountField[] = splitAmount ? ["Spent", "Received"] : ["Amount"];
  const withAmountField = (filters: BankAdvancedFilters): BankAdvancedFilters =>
    amountFields.includes(filters.amount.field)
      ? filters
      : { ...filters, amount: { field: splitAmount ? "Spent" : "Amount", min: "", max: "" } };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(withAmountField(value));
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <ListFilter />
          Filters{count ? ` (${count})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Transaction filters"
        className="max-h-[var(--radix-popover-content-available-height)] w-[32rem] max-w-[calc(100vw_-_2rem)] overflow-y-auto"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            change(draft);
            setOpen(false);
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">Transaction filters</h3>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close filters"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {bankTextFilters.map(({ id, name }) => (
              <Field key={id} name={name}>
                <input
                  className={fieldStyle}
                  value={draft[id]}
                  placeholder="Contains…"
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((previous) => ({ ...previous, [id]: value }));
                  }}
                />
              </Field>
            ))}
            <SelectField
              name="Files"
              value={draft.files}
              options={[
                { id: "attached", name: "With attachments" },
                { id: "missing", name: "Without attachments" },
              ]}
              placeholder="All"
              change={(files) => setDraft((previous) => ({ ...previous, files }))}
            />
            {bankFilterFields.map(({ id, name }) => (
              <SelectField
                key={id}
                name={name}
                value={draft[id]}
                options={options[id]}
                placeholder="All"
                change={(selected) => setDraft((previous) => ({ ...previous, [id]: selected }))}
              />
            ))}
          </div>
          <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">
              {splitAmount ? "Movement amount" : "Amount"}
            </legend>
            {splitAmount && (
              <div className="sm:col-span-2">
                <Field name="Amount column">
                  <select
                    className={fieldStyle}
                    value={draft.amount.field}
                    onChange={(event) => {
                      const field = event.target.value === "Received" ? "Received" : "Spent";
                      setDraft((previous) => ({
                        ...previous,
                        amount: { ...previous.amount, field },
                      }));
                    }}
                  >
                    <option value="Spent">Spent</option>
                    <option value="Received">Received</option>
                  </select>
                </Field>
              </div>
            )}
            {(["min", "max"] as const).map((bound) => (
              <Field key={bound} name={bound === "min" ? "Minimum amount" : "Maximum amount"}>
                <input
                  className={fieldStyle}
                  type="number"
                  step="any"
                  min={(bound === "max" && draft.amount.min) || (splitAmount ? 0 : undefined)}
                  max={bound === "min" ? draft.amount.max || undefined : undefined}
                  value={draft.amount[bound]}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((previous) => ({
                      ...previous,
                      amount: { ...previous.amount, [bound]: value },
                    }));
                  }}
                />
              </Field>
            ))}
          </fieldset>
          <div className="mt-4 flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(withAmountField(emptyBankFilters));
                change(emptyBankFilters);
              }}
            >
              Reset
            </Button>
            <Button type="submit">Apply</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
