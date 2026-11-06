import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Shared styles so every registry screen looks and behaves the same. */
export const fieldControl =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-60";
export const primaryButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand px-3.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
export const secondaryButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink2 transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
export const dangerButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-down px-3.5 text-sm font-medium text-white transition-colors hover:bg-down/90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** Client-side pagination that snaps back to page 1 whenever the filter key changes. */
export function usePagination<T>(rows: T[], resetKey: string, initialSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  useEffect(() => setPage(1), [resetKey, pageSize]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((current - 1) * pageSize, current * pageSize),
    [rows, current, pageSize],
  );
  return { page: current, setPage, pageSize, setPageSize, pageCount, pageRows, total: rows.length };
}

export type FilterOption = { value: string; label: string };
export type FilterDef = {
  key: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  /** Label of the "no filter" option; defaults to "All". */
  allLabel?: string;
};

export function ListToolbar({
  search,
  onSearch,
  placeholder,
  filters = [],
  extra,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  filters?: FilterDef[];
  extra?: ReactNode;
}) {
  const active = Boolean(search) || filters.some((f) => f.value);
  return (
    <div className="frost flex flex-col gap-3 p-3 lg:flex-row lg:items-end">
      <label className="relative block min-w-0 flex-1">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink3" />
        <input
          type="search"
          className={`${fieldControl} pl-9`}
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      {filters.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          {filters.map((f) => (
            <label key={f.key} className="block min-w-[9rem] text-[11px] font-medium text-ink3">
              {f.label}
              <select
                className={`${fieldControl} mt-1`}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
              >
                <option value="">{f.allLabel ?? "All"}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {extra}
      {active && (
        <button
          type="button"
          className={`${secondaryButton} shrink-0`}
          onClick={() => {
            onSearch("");
            filters.forEach((f) => f.onChange(""));
          }}
        >
          <X className="size-4" /> Clear
        </button>
      )}
    </div>
  );
}

export function PaginationBar({
  page,
  pageCount,
  pageSize,
  total,
  setPage,
  setPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}) {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const nav =
    "inline-flex size-8 items-center justify-center rounded-md border border-line bg-white text-ink2 transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer";
  return (
    <div className="flex flex-col gap-2 border-t border-line/70 px-4 py-2.5 text-[12px] text-ink3 sm:flex-row sm:items-center sm:justify-between">
      <p className="tabular-nums">
        Showing <span className="font-medium text-ink2">{from}</span>–
        <span className="font-medium text-ink2">{to}</span> of{" "}
        <span className="font-medium text-ink2">{total}</span>
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          Rows
          <select
            className="h-8 rounded-md border border-line bg-white px-2 text-[12px] text-ink"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={nav}
            aria-label="First page"
            disabled={page <= 1}
            onClick={() => setPage(1)}
          >
            <ChevronsLeft className="size-4" />
          </button>
          <button
            type="button"
            className={nav}
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="px-2 tabular-nums">
            Page <span className="font-medium text-ink2">{page}</span> of {pageCount}
          </span>
          <button
            type="button"
            className={nav}
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            className={nav}
            aria-label="Last page"
            disabled={page >= pageCount}
            onClick={() => setPage(pageCount)}
          >
            <ChevronsRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reason string = action blocked (shown as tooltip); null/undefined = allowed. */
export type ActionState = { hidden?: boolean; blocked?: string | null };

export function RowActions({
  onView,
  onEdit,
  onDelete,
  edit = {},
  remove = {},
  extra,
}: {
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  edit?: ActionState;
  remove?: ActionState;
  extra?: ReactNode;
}) {
  const icon =
    "inline-flex size-8 items-center justify-center rounded-md text-ink3 transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent cursor-pointer";
  return (
    <div className="flex items-center justify-end gap-0.5">
      {onView && (
        <button type="button" className={icon} title="View" aria-label="View" onClick={onView}>
          <Eye className="size-4" />
        </button>
      )}
      {onEdit && !edit.hidden && (
        <button
          type="button"
          className={icon}
          title={edit.blocked || "Edit"}
          aria-label="Edit"
          disabled={Boolean(edit.blocked)}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </button>
      )}
      {extra}
      {onDelete && !remove.hidden && (
        <button
          type="button"
          className={`${icon} hover:!text-down`}
          title={remove.blocked || "Delete"}
          aria-label={remove.blocked ? `Delete unavailable: ${remove.blocked}` : "Delete"}
          disabled={Boolean(remove.blocked)}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Avatar({ name, tone = "brand" }: { name: string; tone?: "brand" | "neutral" }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
        tone === "brand" ? "bg-brand/10 text-brand" : "bg-ink/[0.06] text-ink2"
      }`}
    >
      {initials}
    </span>
  );
}

/** Two-line identity cell: avatar + title + muted subtitle. */
export function IdentityCell({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={typeof title === "string" ? title : ""} />
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{title}</p>
        {subtitle && <p className="truncate text-[11px] text-ink3">{subtitle}</p>}
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-ink3">
        {children}
      </td>
    </tr>
  );
}

export type DetailField = { label: string; value: ReactNode; wide?: boolean };
export type DetailSection = { title: string; fields: DetailField[] };

const shown = (value: ReactNode) =>
  value === null || value === undefined || value === "" ? (
    <span className="text-ink3">—</span>
  ) : (
    value
  );

export function DetailDialog({
  open,
  onClose,
  title,
  subtitle,
  sections,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | undefined;
  sections: DetailSection[];
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar name={title} />
            <div className="min-w-0">
              <DialogTitle className="truncate">{title}</DialogTitle>
              {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          {sections
            .filter((s) => s.fields.length)
            .map((section) => (
              <section key={section.title} className="rounded-lg border border-line">
                <p className="col-head border-b border-line/70 px-4 py-2">{section.title}</p>
                <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
                  {section.fields.map((f) => (
                    <div key={f.label} className={f.wide ? "sm:col-span-2" : ""}>
                      <dt className="text-[11px] font-medium text-ink3">{f.label}</dt>
                      <dd className="mt-0.5 break-words text-sm text-ink">{shown(f.value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">{footer}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDelete({
  target,
  entity,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  /** Display name of the record being deleted; null keeps the dialog closed. */
  target: string | null;
  entity: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error?: string;
}) {
  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && !pending && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {entity}?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="text-ink">{target}</strong> will be permanently removed. It has no
            linked records, so nothing else is affected. The deletion is recorded in the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="rounded border border-down/20 bg-down/10 p-3 text-sm text-down">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-down text-white hover:bg-down/90"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Joins blocking reasons into one tooltip, or returns null when the record is free to delete. */
export function blockedBy(reasons: (string | false | null | undefined)[]) {
  const list = reasons.filter(Boolean) as string[];
  return list.length ? `Cannot delete: linked to ${list.join(", ")}.` : null;
}

export const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;
