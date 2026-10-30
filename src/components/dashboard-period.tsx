import { useState } from "react";

import { localDate, currentMonth, type DashboardPeriod } from "@/lib/dashboard-period";

export function DashboardPeriodFilter({
  period,
  onChange,
}: {
  period: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
}) {
  const [draft, setDraft] = useState(period);
  const invalid =
    !draft.start ||
    !draft.end ||
    draft.start > draft.end ||
    Number(draft.end.slice(0, 4)) - Number(draft.start.slice(0, 4)) > 10;
  const apply = (value: DashboardPeriod) => {
    setDraft(value);
    onChange(value);
  };
  const quick = (value: string) => {
    const now = new Date();
    const year = now.getFullYear(),
      month = now.getMonth();
    if (value === "month") apply(currentMonth());
    if (value === "last")
      apply({
        start: localDate(new Date(year, month - 1, 1)),
        end: localDate(new Date(year, month, 0)),
      });
    if (value === "year") apply({ start: `${year}-01-01`, end: localDate(now) });
    if (value === "next") {
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      apply({ start: localDate(now), end: localDate(end) });
    }
  };
  return (
    <form
      className="frost flex flex-wrap items-end gap-3 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) onChange(draft);
      }}
    >
      <label className="text-xs text-ink2">
        Start date
        <input
          type="date"
          required
          value={draft.start}
          onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          className="mt-1 block rounded border border-line bg-white px-2 py-1.5"
        />
      </label>
      <label className="text-xs text-ink2">
        End date
        <input
          type="date"
          required
          min={draft.start}
          value={draft.end}
          onChange={(e) => setDraft({ ...draft, end: e.target.value })}
          className="mt-1 block rounded border border-line bg-white px-2 py-1.5"
        />
      </label>
      <button
        type="submit"
        disabled={invalid}
        className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        Apply period
      </button>
      <div className="flex flex-wrap gap-2">
        {[
          ["month", "This month"],
          ["last", "Last month"],
          ["year", "Year to date"],
          ["next", "Next 30 days"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => quick(value!)}
            className="rounded border border-line bg-white/80 px-2 py-1.5 text-xs text-ink2 hover:text-brand"
          >
            {label}
          </button>
        ))}
      </div>
      {invalid && (
        <p role="alert" className="w-full text-xs text-down">
          Select valid dates in order, spanning no more than 10 years.
        </p>
      )}
    </form>
  );
}
