import { useState } from "react";
import { ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField } from "@/components/bank-feed-ui";
import {
  bankFilterFields,
  emptyBankFilters,
  type BankAdvancedFilters,
  type BankFilterOptions,
} from "@/lib/bank-feed-filters";

export function BankFeedFilters({
  value,
  options,
  change,
}: {
  value: BankAdvancedFilters;
  options: BankFilterOptions;
  change: (value: BankAdvancedFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const count = Object.values(value).filter(Boolean).length;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value);
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
        className="w-[30rem] max-w-[calc(100vw_-_2rem)]"
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
          <div className="mt-4 flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(emptyBankFilters);
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
