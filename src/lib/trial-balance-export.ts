import type { TrialReport } from "./trial-balance";
import { exactSum } from "./trial-balance";
export async function exportTrial(report: TrialReport, format: "csv" | "xlsx" | "pdf") {
  const detailed = report.filters.view === "Detailed";
  const keys = detailed
    ? ([
        "opening_debit",
        "opening_credit",
        "period_debit",
        "period_credit",
        "closing_debit",
        "closing_credit",
      ] as const)
    : (["closing_debit", "closing_credit"] as const);
  const headers = [
    "Account Code",
    "Account Name",
    "Account Type",
    ...keys.map((k) => k.replaceAll("_", " ")),
  ];
  const metadata = [
    ["Entity", report.company],
    ["Period", `${report.filters.start} to ${report.filters.end}`],
    ["Functional currency", report.currency],
    ["Generated", report.generated],
    ["Filters", JSON.stringify(report.filters)],
    ["Global status", report.status],
    ["Global debit", report.total_debit],
    ["Global credit", report.total_credit],
    ["Global difference", report.difference],
  ];
  const rows = report.accounts.map((a) => [a.code, a.name, a.type, ...keys.map((k) => a[k])]);
  rows.push([
    "TOTAL (displayed accounts)",
    "",
    "",
    ...keys.map((k) => exactSum(report.accounts.map((a) => a[k]))),
  ]);
  let blob: Blob;
  if (format === "csv") {
    const cell = (s: string) =>
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
    blob = new Blob(
      [
        "\uFEFF" +
          [...metadata, [], headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
  } else if (format === "xlsx") {
    const { Workbook } = await import("exceljs");
    const book = new Workbook();
    const sheet = book.addWorksheet("Trial Balance");
    sheet.addRows([...metadata, [], headers, ...rows]);
    sheet.columns.forEach((c) => {
      c.width = 24;
    });
    blob = new Blob([(await book.xlsx.writeBuffer()) as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } else {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    pdf.setFontSize(9);
    let y = 12;
    for (const row of metadata) {
      for (const line of pdf.splitTextToSize(row.join(": "), 390)) {
        pdf.text(line, 10, y);
        y += 5;
      }
    }
    const draw = (row: string[]) => {
      const widths = detailed ? [24, 78, 42, 40, 40, 40, 40, 40, 40] : [30, 130, 70, 75, 75];
      let x = 10;
      const lines = row.map((v, i) => pdf.splitTextToSize(v, widths[i]! - 3));
      const height = Math.max(...lines.map((l) => l.length)) * 4 + 3;
      if (y + height > 285) {
        pdf.addPage();
        y = 12;
      }
      lines.forEach((l, i) => {
        pdf.text(l, x, y);
        x += widths[i]!;
      });
      y += height;
    };
    draw(headers);
    rows.forEach(draw);
    blob = pdf.output("blob");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trial-balance-${report.filters.end}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
