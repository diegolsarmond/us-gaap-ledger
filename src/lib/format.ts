export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** US GAAP accounting format: negative numbers in parentheses e.g. ($1,250.00) */
export const acct = (n: number) => (n < 0 ? `(${usd(Math.abs(n))})` : usd(n));

export const pct = (n: number) => `${n.toFixed(1)}%`;

export const dash = (n: number) => (n === 0 ? "—" : usd(n));

export const formatDate = (dateStr: string) => {
  if (!dateStr) return "—";
  try {
    const [year, month, day] = dateStr.split("-");
    if (!year || !month || !day) return dateStr;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
};

export const exportToCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const processCell = (val: string | number) => {
    const stringVal = String(val ?? "");
    if (stringVal.includes(",") || stringVal.includes('"') || stringVal.includes("\n")) {
      return `"${stringVal.replace(/"/g, '""')}"`;
    }
    return stringVal;
  };

  const csvContent =
    "data:text/csv;charset=utf-8," +
    [headers.map(processCell).join(","), ...rows.map((r) => r.map(processCell).join(","))].join(
      "\n",
    );

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `${filename.replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().split("T")[0]}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
