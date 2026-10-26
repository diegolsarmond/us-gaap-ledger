import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

type Option = { value: string; label: string; disabled?: boolean };

/** Searchable form select. Suggestions always open below the field. */
export function SearchableSelect({
  options,
  name,
  label,
  placeholder = "Select an option",
  value,
  defaultValue = "",
  onChange,
  required = false,
  autoFocus = false,
}: {
  options: Option[];
  name?: string;
  label: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = value ?? internalValue;
  function changeOpen(nextOpen: boolean) {
    // Keep the list inside the dialog's scroll-lock boundary so wheel events work.
    if (nextOpen)
      setPortalContainer(triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
    setOpen(nextOpen);
  }
  useEffect(() => {
    const form = inputRef.current?.form;
    const reset = () => {
      setInternalValue(defaultValue);
      setOpen(false);
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue]);
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <input
        ref={inputRef}
        name={name}
        value={selected}
        onChange={() => {}}
        required={required}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        aria-hidden="true"
        onInvalid={(event) => {
          event.preventDefault();
          changeOpen(true);
          triggerRef.current?.focus();
        }}
      />
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          aria-label={label}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-white px-3 py-2 text-left text-sm disabled:opacity-50"
        >
          <span className="min-w-0 truncate">
            {options.find((option) => option.value === selected)?.label ?? placeholder}
          </span>
          <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        side="bottom"
        align="start"
        avoidCollisions={false}
        className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput
            aria-label={`Search ${label}`}
            placeholder={`Search ${label.toLowerCase()}…`}
          />
          <CommandList
            className="max-h-56 overflow-y-auto overscroll-contain"
            onWheel={(event) => event.stopPropagation()}
          >
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  disabled={option.disabled ?? false}
                  onSelect={() => {
                    setInternalValue(option.value);
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    aria-hidden="true"
                    className={`mr-2 h-4 w-4 shrink-0 ${selected === option.value ? "opacity-100" : "opacity-0"}`}
                  />
                  <span>{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
