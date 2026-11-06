import { useState } from "react";
import { useAccounting } from "@/lib/parameters-context";
import { postingRoles, type PostingAccount } from "@/lib/posting-accounts";
import { Panel } from "./ui-kit";
export function PostingAccountSettings() {
  const {
    canWrite,
    postingAccounts,
    accounts,
    activeCompany,
    addPostingAccount,
    updatePostingAccount,
    deletePostingAccount,
  } = useAccounting();
  const [error, setError] = useState("");
  async function save(role: PostingAccount["code"], account: string) {
    setError("");
    const old = postingAccounts.find((r) => r.code === role);
    try {
      if (!account) {
        if (old) await deletePostingAccount(old.id);
        return;
      }
      const value: Omit<PostingAccount, "id"> = {
        code: role,
        name: postingRoles[role].name,
        glAccountCode: account,
        status: "Active",
        scope: "companies",
        companyIds: [activeCompany.id],
      };
      if (old) await updatePostingAccount(old.id, value);
      else await addPostingAccount(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save mapping.");
    }
  }
  return (
    <Panel
      title="Automatic posting accounts"
      subtitle="Company-specific mappings used by invoices, bills, settlements, inventory and FX. Changes apply to new postings only."
    >
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {(Object.keys(postingRoles) as PostingAccount["code"][]).map((role) => (
          <label key={role} className="text-sm">
            {postingRoles[role].name}
            <select
              disabled={!canWrite}
              className="w-full rounded border border-line p-2"
              value={postingAccounts.find((r) => r.code === role)?.glAccountCode ?? ""}
              onChange={(e) => void save(role, e.target.value)}
            >
              <option value="">
                Use standard account ({postingRoles[role].preferred} / {postingRoles[role].legacy})
              </option>
              {accounts
                .filter((a) => a.type === postingRoles[role].type)
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
    </Panel>
  );
}
