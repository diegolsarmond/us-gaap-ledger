export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type Source = { id: string; label: string; fields: string[]; rows: Row[] };
export type Join = { source: string; left: string; right: string; kind: "left" | "inner" };
export type Filter = {
  field: string;
  operator: "contains" | "eq" | "neq" | "gte" | "lte" | "empty";
  value: string;
};
export type Report = {
  name: string;
  source: string;
  joins: Join[];
  columns: string[];
  filters: Filter[];
  groups: string[];
  metric: string;
  operation: "count" | "sum" | "avg" | "min" | "max";
  summary: boolean;
  sort: string;
  descending: boolean;
};
export function flatten(value: Record<string, unknown>, prefix = ""): Row {
  const row: Row = {};
  for (const [key, cell] of Object.entries(value)) {
    if (["content", "attachments", "password", "password_hash"].includes(key)) continue;
    const path = prefix + key;
    if (cell && typeof cell === "object" && !Array.isArray(cell))
      Object.assign(row, flatten(cell as Record<string, unknown>, path + "."));
    else if (!Array.isArray(cell))
      row[path] =
        cell == null
          ? null
          : typeof cell === "number" || typeof cell === "boolean"
            ? cell
            : String(cell);
  }
  return row;
}
export function runReport(sources: Source[], report: Report) {
  const source = sources.find((s) => s.id === report.source);
  if (!source) throw new Error("Select an available source.");
  const qualify = (s: Source, r: Row) =>
    Object.fromEntries(s.fields.map((f) => [`${s.id}.${f}`, r[f] ?? null])) as Row;
  let rows = source.rows.map((r) => qualify(source, r));
  let expanded = false;
  const used = new Set([source.id]);
  for (const join of report.joins) {
    const target = sources.find((s) => s.id === join.source);
    if (!target || used.has(target.id) || !join.left || !target.fields.includes(join.right))
      throw new Error("Configure each join and use each source only once.");
    if (
      !Array.from(used).some((id) =>
        sources.find((s) => s.id === id)?.fields.some((f) => `${id}.${f}` === join.left),
      )
    )
      throw new Error("Invalid source field in join.");
    const index = new Map<string, Row[]>();
    for (const row of target.rows) {
      const key = row[join.right];
      if (key == null || key === "") continue;
      const bucket = index.get(String(key)) ?? [];
      bucket.push(row);
      index.set(String(key), bucket);
    }
    const next: Row[] = [];
    for (const row of rows) {
      const key = row[join.left];
      const matches = key == null || key === "" ? [] : (index.get(String(key)) ?? []);
      if (matches.length > 1) expanded = true;
      if (matches.length)
        for (const match of matches) next.push({ ...row, ...qualify(target, match) });
      else if (join.kind === "left") next.push({ ...row, ...qualify(target, {}) });
      if (next.length > 50000)
        throw new Error(
          "The join exceeds 50,000 rows. Choose more specific keys or another source.",
        );
    }
    rows = next;
    used.add(target.id);
  }
  rows = rows.filter((row) =>
    report.filters.every((f) => {
      const cell = row[f.field];
      const value = String(cell ?? "");
      switch (f.operator) {
        case "empty":
          return cell == null || value === "";
        case "contains":
          return value.toLocaleLowerCase().includes(f.value.toLocaleLowerCase());
        case "eq":
          return value === f.value;
        case "neq":
          return value !== f.value;
        case "gte":
          return (
            cell != null &&
            (typeof cell === "number"
              ? Number.isFinite(Number(f.value)) && cell >= Number(f.value)
              : value >= f.value)
          );
        case "lte":
          return (
            cell != null &&
            (typeof cell === "number"
              ? Number.isFinite(Number(f.value)) && cell <= Number(f.value)
              : value <= f.value)
          );
      }
    }),
  );
  const matched = rows.length;
  let columns = report.columns;
  if (report.summary) {
    const buckets = new Map<string, Row[]>();
    for (const row of rows) {
      const key = JSON.stringify(report.groups.map((g) => row[g] ?? null));
      const bucket = buckets.get(key) ?? [];
      bucket.push(row);
      buckets.set(key, bucket);
    }
    if (!rows.length && !report.groups.length) buckets.set("[]", []);
    columns = [...report.groups, "resultado"];
    rows = Array.from(buckets.values()).map((bucket) => {
      const values = bucket
        .map((r) => r[report.metric])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (report.operation !== "count" && bucket.length && !values.length)
        throw new Error("Select a numeric field for the calculation.");
      const total = values.reduce((a, b) => a + b, 0);
      const result =
        report.operation === "count"
          ? bucket.length
          : !values.length
            ? null
            : report.operation === "sum"
              ? total
              : report.operation === "avg"
                ? total / values.length
                : report.operation === "min"
                  ? Math.min(...values)
                  : Math.max(...values);
      return {
        ...Object.fromEntries(report.groups.map((g) => [g, bucket[0]?.[g] ?? null])),
        resultado: result,
      };
    });
  }
  if (report.sort && columns.includes(report.sort))
    rows.sort((a, b) => {
      const x = a[report.sort],
        y = b[report.sort];
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x ?? "").localeCompare(String(y ?? ""), "en-US", { numeric: true })) *
        (report.descending ? -1 : 1)
      );
    });
  return { rows, columns, matched, expanded };
}

