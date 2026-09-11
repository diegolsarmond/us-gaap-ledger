import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/audit-log")({
  head: () =>
    pageHead(
      "Audit Trail & Compliance Log · LedgerX",
      "Immutable chronological record of all operational transactions, posting events, period locks, and administrator overrides.",
    ),
  component: AuditLogPage,
});

function AuditLogPage() {
  const { activeCompany, auditLogs } = useAccounting();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("");

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction ? log.action === filterAction : true;
    return matchesSearch && matchesAction;
  });

  const handleExportCsv = () => {
    const headers = [
      "Log ID",
      "Timestamp (EST)",
      "Actor",
      "Role",
      "Action",
      "Target Type",
      "Target ID",
      "Details",
      "Override Reason",
    ];
    const rows = filteredLogs.map((l) => [
      l.id,
      l.timestamp,
      l.actor,
      l.role,
      l.action,
      l.targetType,
      l.targetId,
      l.details,
      l.overrideReason || "",
    ]);
    exportToCsv(`${activeCompany.id}_audit_trail`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
        <PageTitle
          title="Audit Trail & Security Log"
          description={`Comprehensive operational event logging for ${activeCompany.name} · US GAAP Compliance`}
        />
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs self-start sm:self-auto cursor-pointer"
        >
          Export Audit Trail (CSV)
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white/60 p-3 rounded-lg ring-1 ring-line">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by actor, target ID, or description..."
            className="w-full rounded bg-white px-3 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
          />
        </div>
        <div className="w-full sm:w-auto">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full sm:w-auto rounded bg-white px-3 py-1.5 text-[12px] ring-1 ring-line outline-none"
          >
            <option value="">All Action Types</option>
            <option value="POST_JOURNAL_ENTRY">POST_JOURNAL_ENTRY</option>
            <option value="REVERSE_JOURNAL_ENTRY">REVERSE_JOURNAL_ENTRY</option>
            <option value="CREATE_INVOICE">CREATE_INVOICE</option>
            <option value="RECORD_PAYMENT">RECORD_PAYMENT</option>
            <option value="CREATE_BILL">CREATE_BILL</option>
            <option value="PAY_BILL">PAY_BILL</option>
            <option value="LOCK_PERIOD">LOCK_PERIOD</option>
            <option value="UNLOCK_PERIOD">UNLOCK_PERIOD</option>
            <option value="UPLOAD_STATEMENT">UPLOAD_STATEMENT</option>
            <option value="CLASSIFY_STAGING">CLASSIFY_STAGING</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <Panel
        title="Chronological Audit Register"
        subtitle={`${filteredLogs.length} verified event signatures`}
      >
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Timestamp (EST)</Th>
                <Th>Actor & Role</Th>
                <Th>Action Event</Th>
                <Th>Entity Target</Th>
                <Th>Audit Details</Th>
                <Th>Override Justification</Th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]"
                >
                  <Td className="font-mono text-[11px] text-ink3 whitespace-nowrap">
                    {log.timestamp}
                  </Td>
                  <Td className="text-[12px]">
                    <span className="font-semibold text-ink">{log.actor}</span>
                    <span className="block text-[10px] text-ink3">{log.role}</span>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        log.action.includes("REVERSE") || log.action.includes("LOCK")
                          ? "down"
                          : log.action.includes("POST") || log.action.includes("CREATE")
                            ? "brand"
                            : "neutral"
                      }
                    >
                      {log.action}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-[11.5px] text-ink2">
                    {log.targetType} · {log.targetId}
                  </Td>
                  <Td className="text-[12px] text-ink2 max-w-[340px]">{log.details}</Td>
                  <Td className="text-[11.5px] text-amber-800 font-medium">
                    {log.overrideReason ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 ring-1 ring-amber-200">
                        {log.overrideReason}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
