import { useState } from "react";
import { normalizedFx, money } from "@/lib/transaction-fx";
import type { Invoice, Bill, Project } from "@/lib/accounting-engine";
export function ContactActivity({
  documents,
  projects,
  label,
}: {
  documents: (Invoice | Bill)[];
  projects: Project[];
  label: string;
}) {
  const [currency, setCurrency] = useState("ALL");
  const visible = documents.filter(
    (d) => currency === "ALL" || normalizedFx(d).transactionCurrency === currency,
  );
  const total = money(visible.reduce((s, d) => s + normalizedFx(d).functionalAmount, 0));
  return (
    <section className="space-y-3 rounded border border-line bg-white p-4">
      <h2 className="font-semibold">
        {label}: {total.toLocaleString("en-US", { style: "currency", currency: "USD" })}
      </h2>
      <label className="text-sm">
        Transaction currency{" "}
        <select
          className="rounded border border-line p-2"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="ALL">All currencies</option>
          {[...new Set(documents.map((d) => normalizedFx(d).transactionCurrency))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["Document", "Date", "Project", "Original amount", "Functional amount (USD)"].map(
                (h) => (
                  <th key={h} className="p-2">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => {
              const fx = normalizedFx(d);
              return (
                <tr key={d.id} className="border-t border-line">
                  <td className="p-2">{d.id}</td>
                  <td className="p-2">{d.date}</td>
                  <td className="p-2">
                    {projects.find((p) => p.id === d.projectId)?.name || "General"}
                  </td>
                  <td className="p-2">
                    {fx.transactionCurrency} {fx.transactionAmount.toFixed(2)}
                  </td>
                  <td className="p-2">{fx.functionalAmount.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
