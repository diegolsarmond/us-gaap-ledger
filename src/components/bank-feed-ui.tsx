import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { loadBankFeed, loadBankRow, runBankAction } from "@/lib/bank-feed";
import { cn } from "@/lib/utils";

export type BankList = Awaited<ReturnType<typeof loadBankFeed>>;
export type BankRow = BankList["rows"][number];
export type BankDetail = Awaited<ReturnType<typeof loadBankRow>>;
export type BankRun = (
  input: Parameters<typeof runBankAction>[0]["data"]["input"],
) => ReturnType<typeof runBankAction>;
export const fieldStyle =
  "h-9 w-full min-w-0 rounded-md border border-line bg-background px-2 text-sm";

export function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="block text-xs font-medium text-ink2">{name}</span>
      {children}
    </label>
  );
}

export function SelectField({
  name,
  value,
  change,
  options,
  placeholder = "Select…",
}: {
  name: string;
  value: string;
  change: (value: string) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
}) {
  return (
    <Field name={name}>
      <select
        aria-label={name}
        className={fieldStyle}
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function BankDialog({
  title,
  description,
  close,
  children,
  wide = false,
  contentClassName,
}: {
  title: string;
  description: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
  contentClassName?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className={cn("max-h-[94dvh] w-[96vw]", wide ? "max-w-6xl" : "max-w-xl", contentClassName)}
      >
        {/* Scroll the body so dropdowns portaled to the dialog can overflow it. */}
        <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="rounded-md border border-down/25 bg-down/5 p-2 text-sm text-down">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}

export function DuplicateConfirmation({
  row,
  checked,
  change,
}: {
  row: BankRow;
  checked: boolean;
  change: (value: boolean) => void;
}) {
  return row.duplicate ? (
    <label className="flex gap-2 rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950">
      <input type="checkbox" checked={checked} onChange={(e) => change(e.target.checked)} />I
      reviewed this possible duplicate and confirmed it is a separate movement.
    </label>
  ) : null;
}

export function BankSubmit({
  busy,
  children,
  disabled,
}: {
  busy: boolean;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button type="submit" disabled={busy || disabled}>
      {busy ? "Saving…" : children}
    </Button>
  );
}
