import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { importAccountList, loadAccounting } from "@/lib/accounting";
import type { Account } from "@/lib/accounting-store";
import { Panel, Table, Td, Th } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

export function AccountListImport({ companyId, name }: { companyId: string; name: string }) {
  const client = useQueryClient();
  const [preview, setPreview] = useState<{
    content: string;
    revision: number;
    accounts: Account[];
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function read(file?: File) {
    setPreview(undefined);
    setError("");
    setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > 2_000_000)
        throw new Error("Select an Account List CSV of up to 2 MB.");
      const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const { revision } = await loadAccounting({ data: { companyId } });
      const { accounts } = await importAccountList({
        data: { companyId, revision, content, preview: true },
      });
      setPreview({ content, revision, accounts });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to validate the CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    try {
      const { count } = await importAccountList({
        data: { companyId, revision: preview.revision, content: preview.content, preview: false },
      });
      setMessage(`${count} accounts imported into ${name}.`);
      await Promise.all(
        [
          "accounting",
          "parameters",
          "journal-parameters",
          "journal-config",
          "cash-flow-links",
          "bank-feed",
        ].map((key) => client.invalidateQueries({ queryKey: [key, companyId] })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to import the accounts.");
    } finally {
      setPreview(undefined);
      setBusy(false);
    }
  }

  return (
    <Panel title="Import QuickBooks Account List" subtitle={`Destination company · ${name}`}>
      <div className="space-y-3 p-4 text-sm">
        <p>
          Upload the Account List CSV exported from QuickBooks. Review classifications and account
          codes before saving. Reported balances are saved for reference. Ledger balances come from
          journal entries.
        </p>
        <label className="block">
          Account List CSV
          <input
            className="ml-3 max-w-full"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void read(file);
            }}
          />
        </label>
        {busy && <p role="status">Processing account list…</p>}
        {error && (
          <p role="alert" className="text-down">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {preview && (
          <>
            <p>
              {preview.accounts.length} accounts validated. Missing numbers receive an internal
              code. Numbers reserved for automatic postings receive a QBO prefix.
            </p>
            <div className="max-h-80 overflow-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Source #</Th>
                    <Th>Internal code</Th>
                    <Th>Account path</Th>
                    <Th>Type / normal balance</Th>
                    <Th>Parent code</Th>
                    <Th>Currency</Th>
                    <Th align="right">Reported balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.accounts.map((a) => (
                    <tr key={a.code}>
                      <Td>{a.sourceAccount?.number || "—"}</Td>
                      <Td>{a.code}</Td>
                      <Td>{a.sourceAccount?.path}</Td>
                      <Td>
                        {a.type} · {a.balanceType}
                      </Td>
                      <Td>{a.parentCode || "—"}</Td>
                      <Td>{a.sourceAccount?.currency}</Td>
                      <Td align="right">{a.sourceAccount?.balance ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <Button disabled={busy} onClick={() => void save()}>
              Confirm import
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}
