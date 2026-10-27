import { useCompanies } from "@/components/company-context";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuditEvents } from "@/lib/admin";
import { PageTitle, Panel, Table, Th, Td } from "@/components/ui-kit";
import {
  auditAction,
  auditChanges,
  auditLabel,
  auditValue,
  parseAuditData,
} from "@/lib/audit-display";
import type { AuditEvent } from "@/lib/admin-model";
export const Route = createFileRoute("/audit-log")({ component: AuditPage });
function ChangeDetails({ event }: { event: AuditEvent }) {
  const before = parseAuditData(event.before_data);
  const after = parseAuditData(event.after_data);
  const changes = auditChanges(before, after);
  if (!changes.length)
    return (
      <span className="text-xs text-ink3">
        {event.action === "LOGIN"
          ? "Sign-in recorded."
          : before === null && after === null
            ? "No details were recorded for this event."
            : "No field changes recorded."}
      </span>
    );
  return (
    <details className="min-w-64">
      <summary className="cursor-pointer text-brand">
        View details · {changes.length} {changes.length === 1 ? "field" : "fields"}
      </summary>
      <div className="mt-2 max-h-96 overflow-auto rounded-md border border-line bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <Th>Field</Th>
              {before !== null && <Th>Before</Th>}
              {after !== null && <Th>After</Th>}
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.key} className="border-t border-line">
                <Td className="align-top font-medium">{change.label}</Td>
                {before !== null && (
                  <Td className="min-w-40 max-w-80 whitespace-pre-wrap break-all align-top text-ink3">
                    {auditValue(change.before)}
                  </Td>
                )}
                {after !== null && (
                  <Td className="min-w-40 max-w-80 whitespace-pre-wrap break-all align-top">
                    {auditValue(change.after)}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
function AuditPage() {
  const { activeCompany } = useCompanies();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const query = useQuery({
    queryKey: ["system-audit", activeCompany?.id, page],
    queryFn: () => getAuditEvents({ data: { page, companyId: activeCompany?.id } }),
  });
  const rows =
    query.data?.events.filter(
      (r) =>
        (!action || r.action === action) &&
        `${r.actor_name} ${r.entity} ${auditLabel(r.entity)} ${auditAction(r.action)} ${r.target_id}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="space-y-4">
      <PageTitle
        title="Audit · Action logs"
        description="History of sign-ins and changes to users, profiles, accounts, and journal entries. Dates are shown in local time."
      />
      {query.isPending && <p role="status">Loading records…</p>}
      {query.isError && (
        <p role="alert">
          Unable to load the audit log. Check your access permissions and try again.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Try again
          </button>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search records on this page"
          placeholder="Search this page by user, entity, action, or ID…"
          className="min-w-64 flex-1 rounded-md border border-line bg-white p-2 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-md border border-line bg-white p-2 text-sm"
        >
          <option value="">All actions</option>
          {Array.from(
            new Set([
              "LOGIN",
              "INSERT",
              "UPDATE",
              "DELETE",
              ...(query.data?.events.map((event) => event.action) ?? []),
            ]),
          )
            .sort((a, b) => auditAction(a).localeCompare(auditAction(b), "en-US"))
            .map((value) => (
              <option key={value} value={value}>
                {auditAction(value)}
              </option>
            ))}
        </select>
      </div>
      {query.isSuccess && (
        <Panel
          title={`Records · page ${page}`}
          subtitle={`${rows.length} records shown · up to 100 per page`}
        >
          <Table>
            <thead>
              <tr>
                <Th>Date and time</Th>
                <Th>Performed by</Th>
                <Th>Action</Th>
                <Th>Entity / record</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>{new Date(r.occurred_at).toLocaleString("en-US")}</Td>
                  <Td>{r.actor_name}</Td>
                  <Td>{auditAction(r.action)}</Td>
                  <Td>
                    {auditLabel(r.entity)}
                    <span className="block font-mono text-xs text-ink3">{r.target_id}</span>
                  </Td>
                  <Td>
                    <ChangeDetails event={r} />
                  </Td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <Td colSpan={5}>No records found.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Panel>
      )}
      <div className="flex items-center gap-4 text-sm">
        <button
          disabled={page === 1 || query.isFetching}
          onClick={() => setPage((p) => p - 1)}
          className="text-brand disabled:opacity-40"
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          disabled={!query.data?.hasMore || query.isFetching}
          onClick={() => setPage((p) => p + 1)}
          className="text-brand disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
