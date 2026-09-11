import type { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  aside,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`frost overflow-hidden ${className}`}>
      {(title || aside) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-line/70 px-4 py-3">
          <div>
            {title && <p className="text-[13px] font-semibold tracking-tight">{title}</p>}
            {subtitle && <p className="text-[11px] text-ink3">{subtitle}</p>}
          </div>
          {aside && <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "up" | "down";
}) {
  const toneClass = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink3";
  return (
    <div className="frost p-3.5 sm:p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink3">{label}</p>
      <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className={`mt-1.5 text-[11px] tabular-nums ${toneClass}`}>{hint}</p>}
    </div>
  );
}

type BadgeTone = "neutral" | "brand" | "up" | "down";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  const map: Record<BadgeTone, string> = {
    neutral: "bg-white/80 text-ink2 ring-line",
    brand: "bg-brand/10 text-brand ring-brand/20",
    up: "bg-up/10 text-up ring-up/20",
    down: "bg-down/10 text-down ring-down/20",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${map[tone]}`}>
      {children}
    </span>
  );
}

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight leading-snug">{title}</h1>
        <p className="text-[12px] text-ink3 leading-normal">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto [scrollbar-width:thin] overscroll-x-contain">
      <table className={`w-full text-[13px] tabular-nums ${className}`}>{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={`col-head px-3 py-2 sm:px-4 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-3 py-2 sm:px-4 sm:py-2.5 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function Note({
  children,
  tone = "up",
}: {
  children: ReactNode;
  tone?: "up" | "brand" | "neutral";
}) {
  const cls =
    tone === "up"
      ? "bg-up/[0.06] text-up ring-up/15"
      : tone === "brand"
        ? "bg-brand/[0.06] text-brand ring-brand/15"
        : "bg-ink/[0.04] text-ink2 ring-line/80";
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] ring-1 ${cls}`}>
      <span
        className={`size-1.5 rounded-full ${
          tone === "up" ? "bg-up" : tone === "brand" ? "bg-brand" : "bg-line"
        }`}
      />
      {children}
    </div>
  );
}
