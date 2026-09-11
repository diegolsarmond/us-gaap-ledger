import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, pct, formatDate, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/projects")({
  head: () =>
    pageHead(
      "Projects & Profitability · LedgerX",
      "Job costing, project profitability, gross margin, and budget versus actual variance tracking.",
    ),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { activeCompany, projects, invoices, bills, createProject, userPersona } = useAccounting();

  // Create Project Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [budget, setBudget] = useState("50000");
  const [contractValue, setContractValue] = useState("75000");
  const [status, setStatus] = useState<"Active" | "Completed" | "On Hold">("Active");
  const [startDate, setStartDate] = useState("2026-12-01");
  const [endDate, setEndDate] = useState("2027-03-31");
  const [notes, setNotes] = useState("");

  // Calculate profitability and budget vs actual for each project
  const projectMetrics = projects.map((p) => {
    // Invoices tagged to this project
    const projectInvoices = invoices.filter((i) => i.projectId === p.id);
    const revenue = projectInvoices.reduce((s, i) => s + i.subtotal, 0);
    const cashCollected = projectInvoices
      .filter((i) => i.status === "Paid")
      .reduce((s, i) => s + i.total, 0);

    // Bills tagged to this project
    const projectBills = bills.filter((b) => b.projectId === p.id);
    const actualCosts = projectBills.reduce((s, b) => s + b.usdAmount, 0);
    const cashDisbursed = projectBills
      .filter((b) => b.status === "Paid")
      .reduce((s, b) => s + b.usdAmount, 0);

    const grossMargin = revenue - actualCosts;
    const marginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
    const budgetVariance = p.budget - actualCosts; // positive = under budget
    const budgetUtilizationPct = p.budget > 0 ? (actualCosts / p.budget) * 100 : 0;
    const cashImpact = cashCollected - cashDisbursed;

    return {
      ...p,
      revenue,
      actualCosts,
      grossMargin,
      marginPct,
      budgetVariance,
      budgetUtilizationPct,
      cashImpact,
      invoicesCount: projectInvoices.length,
      billsCount: projectBills.length,
    };
  });

  const totalContractValue = projects.reduce((s, p) => s + p.contractValue, 0);
  const totalRecognizedRevenue = projectMetrics.reduce((s, p) => s + p.revenue, 0);
  const totalActualCosts = projectMetrics.reduce((s, p) => s + p.actualCosts, 0);
  const totalGrossMargin = totalRecognizedRevenue - totalActualCosts;
  const overallMarginPct =
    totalRecognizedRevenue > 0 ? (totalGrossMargin / totalRecognizedRevenue) * 100 : 0;

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) return;

    createProject({
      code: code.toUpperCase(),
      name,
      clientName: clientName || "Direct Client",
      budget: Number(budget) || 0,
      contractValue: Number(contractValue) || 0,
      status,
      startDate,
      endDate,
      notes,
    });

    setCode("");
    setName("");
    setNotes("");
    alert(`Project ${code} successfully registered!`);
  };

  const handleExportCsv = () => {
    const headers = [
      "Project Code",
      "Project Name",
      "Client",
      "Status",
      "Contract Value ($)",
      "Budget ($)",
      "Recognized Revenue ($)",
      "Direct Costs ($)",
      "Gross Margin ($)",
      "Gross Margin %",
      "Budget Variance ($)",
      "Net Cash Impact ($)",
    ];
    const rows = projectMetrics.map((p) => [
      p.code,
      p.name,
      p.clientName,
      p.status,
      p.contractValue,
      p.budget,
      p.revenue,
      p.actualCosts,
      p.grossMargin,
      p.marginPct.toFixed(1) + "%",
      p.budgetVariance,
      p.cashImpact,
    ]);
    exportToCsv(`${activeCompany.id}_project_profitability`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <PageTitle
          title="Project Profitability & Job Costing"
          description={`Track billable revenue, direct costs, gross margin, and budget utilization for ${activeCompany.name}`}
        />
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
        >
          Export Profitability (CSV)
        </button>
      </div>

      {/* KPI Row */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total Portfolio Value"
          value={usd(totalContractValue)}
          hint={`${projects.length} contracted engagements`}
          tone="neutral"
        />
        <Kpi
          label="Recognized Project Revenue"
          value={usd(totalRecognizedRevenue)}
          hint="From tagged invoices"
          tone="up"
        />
        <Kpi
          label="Direct Project Costs"
          value={usd(totalActualCosts)}
          hint="Tagged vendor bills & inventory"
          tone="neutral"
        />
        <Kpi
          label="Portfolio Gross Margin"
          value={usd(totalGrossMargin)}
          hint={`Overall Margin: ${pct(overallMarginPct)}`}
          tone={totalGrossMargin >= 0 ? "up" : "down"}
        />
      </section>

      {/* Main Grid: Projects Table & Create Project */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Project Profitability Table */}
        <div className="lg:col-span-8 space-y-3">
          <Panel
            title="Active Engagements & Cost Center Margins"
            subtitle="Operational consequence feeds real-time job cost statements"
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Project / Code</Th>
                    <Th>Client</Th>
                    <Th align="right">Budget</Th>
                    <Th align="right">Revenue</Th>
                    <Th align="right">Actual Costs</Th>
                    <Th align="right">Gross Margin</Th>
                    <Th align="right">Budget Used</Th>
                    <Th align="right">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {projectMetrics.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]"
                    >
                      <Td className="font-medium text-ink">
                        <p className="font-mono text-[11.5px] text-brand font-semibold">{p.code}</p>
                        <p className="text-[12px] truncate max-w-[180px]">{p.name}</p>
                      </Td>
                      <Td className="text-ink2 text-[12px]">{p.clientName}</Td>
                      <Td align="right" className="font-mono text-[12px]">
                        {usd(p.budget)}
                      </Td>
                      <Td align="right" className="font-mono font-medium text-[12px] text-up">
                        {usd(p.revenue)}
                      </Td>
                      <Td align="right" className="font-mono text-[12px]">
                        {usd(p.actualCosts)}
                      </Td>
                      <Td align="right" className="font-mono font-medium text-[12px]">
                        <span className={p.grossMargin >= 0 ? "text-up" : "text-down"}>
                          {usd(p.grossMargin)}
                        </span>
                        <span className="block text-[10px] text-ink3 font-sans">
                          {pct(p.marginPct)} margin
                        </span>
                      </Td>
                      <Td align="right" className="font-mono text-[11.5px]">
                        <span
                          className={
                            p.budgetUtilizationPct > 90 ? "text-down font-semibold" : "text-ink2"
                          }
                        >
                          {pct(p.budgetUtilizationPct)}
                        </span>
                        <span className="block text-[10px] text-ink3">
                          {p.budgetVariance >= 0
                            ? `${usd(p.budgetVariance)} left`
                            : `Over by ${usd(Math.abs(p.budgetVariance))}`}
                        </span>
                      </Td>
                      <Td align="right">
                        <Badge
                          tone={
                            p.status === "Completed"
                              ? "up"
                              : p.status === "Active"
                                ? "brand"
                                : "neutral"
                          }
                        >
                          {p.status}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                US GAAP Milestone & Cost-to-Cost Recognition: Transactions tagged with a Project
                code automatically aggregate into real-time job costing and margin schedules without
                manual spreadsheet reconciliations.
              </Note>
            </div>
          </Panel>
        </div>

        {/* Create Project Form */}
        <div className="lg:col-span-4">
          {!userPersona.allowedReportsOnly ? (
            <Panel title="Register New Project" subtitle="Create job cost center">
              <form onSubmit={handleCreateProject} className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Project Code
                    </label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="PRJ-2027-01"
                      required
                      className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) =>
                        setStatus(e.target.value as "Active" | "Completed" | "On Hold")
                      }
                      className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none"
                    >
                      <option value="Active">Active</option>
                      <option value="On Hold">On Hold</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    Project Title / Engagement
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Drydock Mechanical Overhaul"
                    required
                    className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    Client Legal Entity
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Northgate Supply Co."
                    required
                    className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Cost Budget ($)
                    </label>
                    <input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-right font-mono text-[12px] ring-1 ring-line"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Contract Value ($)
                    </label>
                    <input
                      type="number"
                      value={contractValue}
                      onChange={(e) => setContractValue(e.target.value)}
                      className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-right font-mono text-[12px] ring-1 ring-line"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[11.5px] ring-1 ring-line"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Target Completion
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[11.5px] ring-1 ring-line"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    Scope Notes
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Milestone criteria, deliverable timeline..."
                    className="mt-1 w-full rounded bg-white p-2 text-[11.5px] ring-1 ring-line outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-md bg-brand py-2 text-[12.5px] font-semibold text-primary-foreground hover:opacity-95 shadow-2xs"
                >
                  Create Project
                </button>
              </form>
            </Panel>
          ) : (
            <Panel title="Client Portal Notice">
              <div className="p-6 text-center text-ink3 text-[12px]">
                <p>Client portal users can monitor active project margins and budget progress.</p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
