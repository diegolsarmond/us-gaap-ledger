import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { loadCashData, saveCashFlowMapping } from "@/lib/cash-flow";
import { cashFlowLines, type CashFlowLine } from "@/lib/cash-flow-model";
import { PageTitle, Panel, Table, Th, Td } from "@/components/ui-kit";

export const Route = createFileRoute("/parameters/cash-flow-mapping")({
  head: () => ({ meta: [{ title: "Cash flow mapping · World Business" }] }),
  component: MappingPage,
});
const control = "rounded-md border border-line bg-white px-3 py-2 text-sm";
const lineOptions = (direction: "in" | "out") =>
  Object.entries(cashFlowLines).filter(
    ([key, line]) =>
      key !== "internal_transfer" && (line.direction === null || line.direction === direction),
  );

function MappingPage() {
  const { activeCompany } = useCompanies();
  return activeCompany ? (
    <CompanyMapping key={activeCompany.id} companyId={activeCompany.id} />
  ) : (
    <p>Select a company to map cash flow lines.</p>
  );
}

/**
 * Statement of cash flows line for cash moving against each GL account. The Chart of Accounts
 * is the category list; unmapped accounts follow the default rule for their account type.
 */
function CompanyMapping({ companyId }: { companyId: string }) {
  const { activeCompany, permissions } = useCompanies();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["cash-flow", companyId],
    queryFn: () => loadCashData({ data: { companyId } }),
  });
  const [search, setSearch] = useState("");
  const [onlyMapped, setOnlyMapped] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function save(
    account_code: string,
    lines: { inflow_line: CashFlowLine; outflow_line: CashFlowLine } | null,
  ) {
    setPending(account_code);
    setError("");
    try {
      await saveCashFlowMapping({
        data: lines
          ? { companyId, account_code, ...lines }
          : { companyId, account_code, inflow_line: null, outflow_line: null },
      });
      await cache.invalidateQueries({ queryKey: ["cash-flow"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save the mapping.");
    } finally {
      setPending(null);
    }
  }
  const data = query.data;
  const filter = search.trim().toLowerCase();
  const rows = (data?.glAccounts ?? [])
    .filter((a) => !a.cash)
    .map((a) => ({ account: a, mapping: data!.mappings.find((m) => m.account_code === a.code) }))
    .filter(
      ({ account, mapping }) =>
        (!onlyMapped || mapping) &&
        (!filter ||
          `${account.code} ${account.name} ${account.type}`.toLowerCase().includes(filter)),
    );
  const canWrite = permissions.write_cash;
  return (
    <div className="space-y-5">
      <PageTitle
        title="Cash flow mapping"
        description="US GAAP (ASC 230) direct-method line for cash received from or paid to each account. Posted cash and forecasts use it; a single movement can still be reclassified in Cash Flow."
      />
      <Link to="/cash-flow" className="text-brand underline">
        Back to cash flow
      </Link>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {query.isPending && <p role="status">Loading accounts…</p>}
      {query.isError && (
        <p role="alert">
          Unable to load the mapping. Check that database/037_cash_flow_ledger_only.sql has been
          run. <button onClick={() => void query.refetch()}>Try again</button>
        </p>
      )}
      <p className="text-sm text-ink3">
        Movements between bank and cash accounts are always internal transfers and are not listed.
        Unmapped accounts use the default line for their type, shown in grey.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Search accounts"
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={control + " min-w-64 flex-1"}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyMapped}
            onChange={(e) => setOnlyMapped(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Only mapped accounts
        </label>
      </div>
      {data && (
        <Panel title={`Accounts of ${activeCompany!.name}`}>
          <Table>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Type</Th>
                <Th>Cash received from this account</Th>
                <Th>Cash paid to this account</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <Td colSpan={5}>No accounts match.</Td>
                </tr>
              )}
              {rows.map(({ account, mapping }) => {
                const inflow = mapping?.inflow_line ?? account.defaultLines.in;
                const outflow = mapping?.outflow_line ?? account.defaultLines.out;
                const select = (direction: "in" | "out", value: CashFlowLine) => (
                  <select
                    aria-label={`${account.code} ${direction === "in" ? "inflow" : "outflow"} line`}
                    disabled={!canWrite || pending === account.code}
                    value={value}
                    onChange={(e) => {
                      const next = e.target.value as CashFlowLine;
                      void save(account.code, {
                        inflow_line: direction === "in" ? next : inflow,
                        outflow_line: direction === "out" ? next : outflow,
                      });
                    }}
                    className={`max-w-72 rounded border border-line bg-white p-1 text-xs ${mapping ? "" : "text-ink3"}`}
                  >
                    {!lineOptions(direction).some(([key]) => key === value) && (
                      <option value={value}>{cashFlowLines[value].label}</option>
                    )}
                    {lineOptions(direction).map(([key, line]) => (
                      <option key={key} value={key}>
                        {line.activity} · {line.label}
                      </option>
                    ))}
                  </select>
                );
                return (
                  <tr key={account.code} className="border-t border-line">
                    <Td>
                      {account.code} · {account.name}
                    </Td>
                    <Td>{account.type}</Td>
                    <Td>{select("in", inflow)}</Td>
                    <Td>{select("out", outflow)}</Td>
                    <Td>
                      {mapping ? (
                        <button
                          disabled={!canWrite || pending === account.code}
                          className="text-brand underline"
                          onClick={() => void save(account.code, null)}
                        >
                          Mapped · use default
                        </button>
                      ) : (
                        <span className="text-ink3">Default</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
