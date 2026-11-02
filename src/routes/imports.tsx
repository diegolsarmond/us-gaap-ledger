import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { importCatalog, parseImportRows, type ImportDomain } from "@/lib/bulk-import";
import { downloadImportTemplate, readImportWorkbook } from "@/lib/import-workbook";
import { importSpreadsheet, loadAccounting } from "@/lib/accounting";

export const Route = createFileRoute("/imports")({ component: ImportPage });
function ImportPage() {
  const { activeCompany } = useCompanies();
  const [domain, setDomain] = useState<ImportDomain>(activeCompany ? "customers" : "companies");
  const [destination, setDestination] = useState("");
  return (
    <CompanyImports
      key={activeCompany?.id ?? "no-company"}
      companyId={activeCompany?.id ?? ""}
      name={activeCompany?.name ?? "No company selected"}
      domain={domain}
      onDomainChange={(value) => {
        setDomain(value);
        setDestination("");
      }}
      destination={destination}
      onDestinationChange={setDestination}
    />
  );
}
function CompanyImports({
  companyId,
  name,
  domain,
  onDomainChange,
  destination,
  onDestinationChange,
}: {
  companyId: string;
  name: string;
  domain: ImportDomain;
  onDomainChange: (value: ImportDomain) => void;
  destination: string;
  onDestinationChange: (value: string) => void;
}) {
  const { permissions, companies, selectCompany } = useCompanies();
  const client = useQueryClient();
  const query = useQuery({
    enabled: Boolean(companyId) && domain !== "companies",
    queryKey: ["accounting", companyId],
    queryFn: () => loadAccounting({ data: { companyId } }),
  });
  const [rows, setRows] = useState<Record<string, string | number | boolean | null>[]>([]);
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const destinationReady =
    domain === "companies" ||
    (Boolean(companyId) && (domain === "customers" || destination === companyId));
  const allowed =
    domain === "companies"
      ? permissions.manage_companies
      : domain === "fiscalPeriods"
        ? permissions.close_periods
        : permissions.write_accounting;
  async function read(file?: File) {
    setRows([]);
    setRevision(null);
    setMessage("");
    if (!file || !destinationReady || !allowed) return;
    setBusy(true);
    try {
      const records = await readImportWorkbook(file, domain);
      parseImportRows(domain, records);
      const fresh =
        domain === "companies" ? { data: { revision: 0 }, error: null } : await query.refetch();
      if (!fresh.data || fresh.error) throw new Error("Unable to refresh company data.");
      await importSpreadsheet({
        data: {
          ...(companyId ? { companyId } : {}),
          domain,
          rows: records,
          revision: fresh.data.revision,
          preview: true,
        },
      });
      setRows(records);
      setRevision(fresh.data.revision);
      setMessage(`${records.length} records validated. Review the preview and confirm the import.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to read the spreadsheet.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (revision === null || busy || !destinationReady || !allowed) return;
    setBusy(true);
    try {
      await importSpreadsheet({
        data: { ...(companyId ? { companyId } : {}), domain, rows, revision, preview: false },
      });
      setRows([]);
      setRevision(null);
      setMessage(
        domain === "companies"
          ? `${rows.length} companies imported successfully.`
          : `${rows.length} records imported successfully into ${name}.`,
      );
      if (domain === "companies") await client.invalidateQueries({ queryKey: ["companies"] });
      await Promise.all(
        ["accounting", "parameters", "cash-flow", "cash-flow-links"].map((key) =>
          client.invalidateQueries({ queryKey: [key, companyId] }),
        ),
      );
    } catch (e) {
      setRevision(null);
      setMessage(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Bulk Import</h1>
        <p className="text-sm text-ink2">Templates and data imports · {name}</p>
      </div>
      <Panel title="How to import">
        <ol className="list-decimal space-y-2 p-4 pl-9 text-sm">
          <li>
            Choose a data type. For all types except Customers and Companies, select the destination
            client (company).
          </li>
          <li>
            Download the template, replace or delete the example row, and enter your data without
            changing the headers.
          </li>
          <li>
            Upload the spreadsheet for validation. If errors are found, correct the indicated rows
            and upload it again.
          </li>
          <li>
            Review the destination and preview, confirm the import, and wait for the success
            message.
          </li>
        </ol>
      </Panel>
      <Panel
        title="1. Choose data type and destination"
        subtitle="Choose a data type. Each template includes a data sheet and instructions."
      >
        <div className="space-y-3 p-4">
          <label className="block text-sm">
            Data type
            <select
              disabled={busy}
              value={domain}
              onChange={(e) => {
                onDomainChange(e.target.value as ImportDomain);
                setRows([]);
                setRevision(null);
                setMessage("");
              }}
              className="ml-3 rounded border border-line bg-white p-2"
            >
              {Object.entries(importCatalog).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {domain !== "customers" && domain !== "companies" ? (
            <label className="block text-sm">
              Destination client (company) <span className="text-down">*</span>
              <select
                aria-required="true"
                disabled={busy}
                value={destination === companyId ? destination : ""}
                onChange={(e) => {
                  const id = e.target.value;
                  onDestinationChange(id);
                  setRows([]);
                  setRevision(null);
                  setMessage("");
                  if (id) selectCompany(id);
                }}
                className="ml-3 rounded border border-line bg-white p-2"
              >
                <option value="">Select the destination client</option>
                {companies
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.ein ? " · " + c.ein : ""}
                    </option>
                  ))}
              </select>
            </label>
          ) : domain === "companies" ? (
            <p className="text-sm">
              Importing new companies does not require a destination client. New companies will be
              added to the list of companies accessible to your profile.
            </p>
          ) : (
            <p className="text-sm">
              Importing customers does not require a destination client. Records will be created in
              the active company: <strong>{name}</strong>.
            </p>
          )}
          <p className="text-sm text-ink2">{importCatalog[domain].dependency}</p>
        </div>
      </Panel>
      <Panel
        title="2. Download and fill out the template"
        subtitle="The first data row contains examples. Replace or delete this row before importing."
      >
        <div className="space-y-3 p-4">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await downloadImportTemplate(domain);
              } catch {
                setMessage("Unable to generate the template.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Download .xlsx template
          </Button>
        </div>
      </Panel>
      <Panel
        title="3. Upload and validate the spreadsheet"
        subtitle="Up to 1,000 records and 5 MB per file. Imports create new records and reject duplicates."
      >
        <div className="space-y-4 p-4">
          <p className="text-sm">
            The entire batch will be validated. If an error occurs, no records will be saved.
          </p>
          {!destinationReady && (
            <p role="status">Select the destination client in step 1 to enable uploads.</p>
          )}
          {destinationReady && domain !== "companies" && (
            <p className="text-sm">
              Import destination: <strong>{name}</strong> · Data type:{" "}
              <strong>{importCatalog[domain].label}</strong>
            </p>
          )}
          {!allowed && <p role="status">Your profile does not allow importing this data type.</p>}
          <label className="block text-sm">
            Completed spreadsheet
            <input
              key={domain}
              type="file"
              accept=".xlsx"
              disabled={
                busy || !allowed || (domain !== "companies" && !query.data) || !destinationReady
              }
              className="mt-2 block"
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p role="status" aria-live="polite" className="text-sm whitespace-pre-wrap">
            {busy ? "Processing…" : message}
          </p>
          {rows.length > 0 && (
            <>
              <p className="text-sm">
                Preview of the first {Math.min(rows.length, 10)} of {rows.length} records
              </p>
              <div className="overflow-auto max-h-80">
                <table className="text-xs">
                  <thead>
                    <tr>
                      {Object.keys(rows[0]!).map((key) => (
                        <th className="border border-line p-2" key={key}>
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        {Object.entries(row).map(([key, value]) => (
                          <td className="border border-line p-2" key={key}>
                            {String(value ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <h2 className="font-semibold">4. Review and confirm the import</h2>
          <p className="text-sm">
            Review the data type, destination, and previewed records.{" "}
            {domain === "companies"
              ? "Confirming will create the new companies."
              : `Confirming will add all records to ${name}.`}
          </p>
          <Button
            disabled={busy || !allowed || !destinationReady || revision === null}
            onClick={() => void save()}
          >
            Confirm import{rows.length ? ` of ${rows.length} records` : ""}
          </Button>
        </div>
      </Panel>
      <Panel title="Data map">
        <div className="p-4 space-y-3 text-sm">
          {Object.entries(importCatalog).map(([key, item]) => (
            <p key={key}>
              <strong>{item.label}:</strong> available · {item.dependency}.
            </p>
          ))}
          <p>
            <strong>Separate workflows:</strong> journal entries, cash transactions, and bank
            statements require posting, reconciliation, and reference checks. Invoices, bills,
            inventory, and projects belong to modules that are currently unavailable. Users and
            profiles are managed in administration; attachments, audit logs, balances, and reports
            cannot be imported here.
          </p>
        </div>
      </Panel>
    </div>
  );
}
