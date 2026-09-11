import { createFileRoute } from "@tanstack/react-router";
import { useAccounting, USER_PERSONAS, type UserRole } from "@/lib/accounting-store";
import { Badge, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/access")({
  head: () =>
    pageHead(
      "Roles, Permissions & Tenant Isolation · LedgerX",
      "Role-Based Access Control matrix and strict multi-company tenant data isolation rules under US GAAP standards.",
    ),
  component: AccessPage,
});

const ROLE_PERMISSIONS_MATRIX = [
  {
    roleName: "Platform Administrator",
    scope: "Internal Global",
    keyUser: "Carlos A.",
    canCreateTenants: true,
    canManageUsers: true,
    canClosePeriods: true,
    canPostJournals: true,
    canViewAllReports: true,
    canUploadFiles: true,
    description:
      "Firm owner with unrestricted cross-client tenant creation, template management, and master administrative control.",
  },
  {
    roleName: "Accounting Administrator",
    scope: "Internal Firm",
    keyUser: "Sarah Jenkins, CPA",
    canCreateTenants: false,
    canManageUsers: false,
    canClosePeriods: true,
    canPostJournals: true,
    canViewAllReports: true,
    canUploadFiles: true,
    description:
      "Senior accounting manager authorized for period close, closed-period audit overrides, year-end adjustments, and tax filings.",
  },
  {
    roleName: "Accounting Staff",
    scope: "Internal Firm",
    keyUser: "Marcus Vance",
    canCreateTenants: false,
    canManageUsers: false,
    canClosePeriods: false,
    canPostJournals: true,
    canViewAllReports: true,
    canUploadFiles: true,
    description:
      "Operational staff entering daily transactions, customer invoices, vendor bills, and bank staging classifications. Cannot lock periods.",
  },
  {
    roleName: "Client Portal User",
    scope: "External Client",
    keyUser: "Daniel Whitfield",
    canCreateTenants: false,
    canManageUsers: false,
    canClosePeriods: false,
    canPostJournals: false,
    canViewAllReports: false,
    canUploadFiles: true,
    description:
      "Client executive restricted strictly to uploading bank/card statements and viewing authorized statements (P&L, Cash Flow, Trial Balance). No journal access.",
  },
];

function AccessPage() {
  const { activeCompany, companies, currentRole, setCurrentRole, userPersona } = useAccounting();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
        <PageTitle
          title="Role-Based Access Control & Multi-Tenancy"
          description={`Strict tenant isolation and permission enforcement for Carlos' accounting operations`}
        />
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[12px] text-ink3">Active Persona:</span>
          <Badge tone="brand">{userPersona.title}</Badge>
        </div>
      </div>

      {/* Role Switcher Sandbox */}
      <Panel
        title="Interactive Role Persona Sandbox"
        subtitle="Switch your active session role to verify UI permissions, menu hiding, and posting restrictions"
      >
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(USER_PERSONAS) as UserRole[]).map((rKey) => {
            const p = USER_PERSONAS[rKey];
            const isSelected = rKey === currentRole;
            return (
              <div
                key={rKey}
                onClick={() => setCurrentRole(rKey)}
                className={`cursor-pointer rounded-lg p-3.5 ring-1 transition-all ${
                  isSelected
                    ? "bg-brand/10 ring-brand shadow-sm"
                    : "bg-white/70 ring-line hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-ink">{p.name}</span>
                  {isSelected && <Badge tone="brand">Active</Badge>}
                </div>
                <p className="mt-1 text-[11px] text-ink3">{p.title}</p>
                <div className="mt-3 text-[10.5px] text-ink2 space-y-0.5">
                  <p>• Journals: {p.canCreateJournals ? "Allowed" : "Blocked"}</p>
                  <p>• Period Lock: {p.canClosePeriod ? "Authorized" : "Unauthorized"}</p>
                  <p>• Portal Only: {p.allowedReportsOnly ? "Yes" : "Full Access"}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* RBAC Matrix */}
      <Panel
        title="MVP Role Permissions Matrix"
        subtitle="Mandatory security boundaries for internal staff versus external client users"
      >
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Role Name</Th>
                <Th>Access Scope</Th>
                <Th align="center">Post Journals</Th>
                <Th align="center">Close Periods</Th>
                <Th align="center">Upload Feeds</Th>
                <Th align="center">Manage Users</Th>
                <Th>Role Operational Scope</Th>
              </tr>
            </thead>
            <tbody>
              {ROLE_PERMISSIONS_MATRIX.map((r) => (
                <tr
                  key={r.roleName}
                  className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]"
                >
                  <Td className="font-semibold text-ink text-[12.5px]">{r.roleName}</Td>
                  <Td>
                    <Badge tone={r.scope.includes("Internal") ? "brand" : "neutral"}>
                      {r.scope}
                    </Badge>
                  </Td>
                  <Td align="center" className="font-mono text-[12px]">
                    {r.canPostJournals ? "✓" : "—"}
                  </Td>
                  <Td align="center" className="font-mono text-[12px]">
                    {r.canClosePeriods ? "✓" : "—"}
                  </Td>
                  <Td align="center" className="font-mono text-[12px]">
                    {r.canUploadFiles ? "✓" : "—"}
                  </Td>
                  <Td align="center" className="font-mono text-[12px]">
                    {r.canManageUsers ? "✓" : "—"}
                  </Td>
                  <Td className="text-[11.5px] text-ink2 max-w-[320px]">{r.description}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Panel>

      {/* Tenant Isolation Overview */}
      <Panel
        title="Multi-Tenant Data Segregation"
        subtitle="Complete database partition by client legal entity"
      >
        <div className="p-4 space-y-3">
          <p className="text-[12px] text-ink2 leading-relaxed">
            Each client company operates as an isolated workspace with separate chart of accounts
            balances, customer catalogs, vendor obligations, and bank source files. Client portal
            users assigned to one company cannot query or view another client’s records under any
            circumstance.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2">
            {companies.map((c) => (
              <div key={c.id} className="rounded-lg bg-ink/[0.02] p-3 ring-1 ring-line/70">
                <div className="flex items-center gap-2">
                  <div className="grid size-6 place-items-center rounded bg-brand/10 font-mono text-[10px] font-bold text-brand">
                    {c.initials}
                  </div>
                  <div className="leading-tight">
                    <p className="text-[12px] font-semibold text-ink">{c.name}</p>
                    <p className="text-[10px] text-ink3">EIN {c.ein}</p>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-ink2 space-y-0.5 border-t border-line/40 pt-2">
                  <p>
                    Entity: <span className="font-medium text-ink">{c.entity}</span> ({c.state})
                  </p>
                  <p>
                    Cost Method: <span className="font-medium text-ink">{c.costMethod}</span>
                  </p>
                  <p>
                    Status:{" "}
                    <span className="font-medium text-ink">
                      {c.isPeriodClosed ? "Period Locked" : "Period Open"}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
