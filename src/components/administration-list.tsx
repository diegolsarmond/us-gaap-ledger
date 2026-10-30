import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadAdministration, updateProfile, updateUser, resetUserPassword } from "@/lib/admin";
import type { Profile, ManagedUser } from "@/lib/admin-model";
import { PageTitle, Panel, Table, Th, Td, Badge } from "./ui-kit";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const control = "rounded-md border border-line bg-white px-3 py-2 text-sm w-full";
const button = "rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-brand/90 transition-colors cursor-pointer";

const permissions = {
  manage_users: "Manage users",
  manage_profiles: "Manage profiles",
  view_audit: "View audit log",
  write_cash: "Edit cash flow",
  manage_companies: "Manage companies",
  write_accounting: "Use accounting modules",
  close_periods: "Manage and close periods",
} as const;

export function AdministrationList({ kind }: { kind: "users" | "profiles" }) {
  const query = useQuery({ queryKey: ["administration"], queryFn: () => loadAdministration() });
  const client = useQueryClient();
  const [editing, setEditing] = useState<ManagedUser | Profile | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [copied, setCopied] = useState(false);

  async function resetPassword() {
    if (!resetTarget || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await resetUserPassword({ data: { id: resetTarget.id } });
      setGeneratedPassword(result.password);
      setCopied(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setPending(false);
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setError("");
    } catch {
      setError("Unable to copy. Select the password and copy it manually.");
    }
  }

  const users = kind === "users";
  const allowed = users
    ? query.data?.permissions.manage_users
    : query.data?.permissions.manage_profiles;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    setNotice("");
    try {
      const base = {
        ...(editing && editing !== "new" ? { id: editing.id } : {}),
        name: String(f.get("name")),
      };
      if (users)
        await updateUser({
          data: {
            ...base,
            email: String(f.get("email")),
            profile_id: String(f.get("profile_id")),
            active: f.get("active") === "on",
            ...(f.get("password") ? { password: String(f.get("password")) } : {}),
          },
        });
      else
        await updateProfile({
          data: {
            ...base,
            manage_users: f.get("manage_users") === "on",
            manage_profiles: f.get("manage_profiles") === "on",
            view_audit: f.get("view_audit") === "on",
            write_cash: f.get("write_cash") === "on",
            manage_companies: f.get("manage_companies") === "on",
            write_accounting: f.get("write_accounting") === "on",
            close_periods: f.get("close_periods") === "on",
            all_companies: f.get("all_companies") === "on",
            company_ids: f.getAll("company_ids").map(String),
          },
        });
      await client.invalidateQueries({ queryKey: ["administration"] });
      await client.invalidateQueries({ queryKey: ["companies"] });
      await client.invalidateQueries({ queryKey: ["accounting"] });
      setEditing(null);
      setNotice("Changes saved and recorded in the audit log.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setPending(false);
    }
  }

  const rows =
    (users ? query.data?.users : query.data?.profiles)?.filter((r) =>
      `${r.name} ${"email" in r ? r.email : ""}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  return (
    <div className="space-y-4">
      <PageTitle
        title={users ? "Settings · Users" : "Settings · Access profiles"}
        description="Manage system users and access profiles."
        actions={
          allowed ? (
            <button
              className={button}
              onClick={() => {
                setEditing("new");
                setError("");
                setNotice("");
              }}
            >
              {users ? "New user" : "New profile"}
            </button>
          ) : undefined
        }
      />
      {query.isPending && <p role="status">Loading…</p>}
      {query.isError && (
        <p role="alert">
          Unable to load. Check the connection and migration 003_access_audit.sql.{" "}
          <button onClick={() => void query.refetch()} className="underline">
            Try again
          </button>
        </p>
      )}
      {query.isSuccess && !allowed && (
        <p role="alert">Your profile does not allow you to manage this list.</p>
      )}
      {error && !editing && !resetTarget && (
        <p role="alert" className="text-down">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-up">
          {notice}
        </p>
      )}
      {allowed && (
        <>
          <input
            aria-label="Search list"
            placeholder="Search by name or email…"
            className={control}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Panel title={`${users ? "Users" : "Access profiles"} (${rows.length})`}>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  {users ? (
                    <>
                      <Th>Email</Th>
                      <Th>Profile</Th>
                      <Th>Status</Th>
                    </>
                  ) : (
                    <>
                      <Th>Permissions</Th>
                      <Th>Users / maintenance</Th>
                    </>
                  )}
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td>{r.name}</Td>
                    {"email" in r ? (
                      <>
                        <Td>{r.email}</Td>
                        <Td>
                          {query.data?.profiles.find((p) => p.id === r.profile_id)?.name ??
                            "No profile"}
                        </Td>
                        <Td>
                          <Badge tone={r.active ? "brand" : "neutral"}>
                            {r.active ? "Active" : "Inactive"}
                          </Badge>
                        </Td>
                      </>
                    ) : (
                      <>
                        <Td>
                          {Object.entries(permissions)
                            .filter(([key]) => r[key as keyof typeof permissions])
                            .map(([, label]) => label)
                            .join(" · ") || "Read-only"}
                        </Td>
                        <Td>{r.system_admin ? "Protected administrator" : "Customizable"}</Td>
                      </>
                    )}
                    <Td>
                      <button
                        disabled={pending || ("system_admin" in r && r.system_admin)}
                        className="text-brand underline disabled:opacity-40 cursor-pointer"
                        onClick={() => {
                          setEditing(r);
                          setError("");
                          setNotice("");
                        }}
                      >
                        Edit
                      </button>
                      {"email" in r && (
                        <button
                          disabled={pending}
                          className="ml-3 text-brand underline disabled:opacity-40 cursor-pointer"
                          onClick={() => {
                            setResetTarget(r);
                            setGeneratedPassword("");
                            setCopied(false);
                            setEditing(null);
                            setError("");
                            setNotice("");
                          }}
                        >
                          Reset password
                        </button>
                      )}
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

          {/* Reset password Modal */}
          <Dialog
            open={Boolean(resetTarget)}
            onOpenChange={(open) => {
              if (!open) {
                setResetTarget(null);
                setGeneratedPassword("");
                setCopied(false);
              }
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Reset password</DialogTitle>
                <DialogDescription>
                  {resetTarget?.name} · {resetTarget?.email}
                </DialogDescription>
              </DialogHeader>

              {error && (
                <p role="alert" className="text-down text-sm bg-down/10 border border-down/20 rounded p-3">
                  {error}
                </p>
              )}

              <div className="space-y-4 pt-1">
                {generatedPassword ? (
                  <>
                    <p role="status" className="text-sm text-up font-medium">
                      Password reset successfully. Copy it before closing.
                    </p>
                    <label className="block text-xs font-medium text-ink">
                      New strong password
                      <input
                        aria-label="New strong password"
                        className={`${control} font-mono mt-1 font-semibold select-all`}
                        readOnly
                        value={generatedPassword}
                        onFocus={(event) => event.target.select()}
                      />
                    </label>
                    <div className="flex justify-between items-center pt-2">
                      <button
                        type="button"
                        className="rounded border border-line px-4 py-2 text-sm text-ink2 hover:bg-canvas transition-colors cursor-pointer"
                        onClick={() => {
                          setResetTarget(null);
                          setGeneratedPassword("");
                          setCopied(false);
                        }}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        className={button}
                        onClick={() => void copyPassword()}
                      >
                        {copied ? "Password copied!" : "Copy password"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-ink2">
                      A strong 20-character password will be generated. The current password will be
                      replaced and this user's sessions will be ended. They must change the password
                      at their next login.
                    </p>
                    <div className="flex justify-end gap-3 pt-2 border-t border-line">
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded border border-line px-4 py-2 text-sm text-ink2 hover:bg-canvas transition-colors cursor-pointer"
                        onClick={() => {
                          setResetTarget(null);
                          setGeneratedPassword("");
                          setCopied(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={pending}
                        onClick={() => void resetPassword()}
                      >
                        {pending ? "Resetting…" : "Confirm reset"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* New / Edit Record Modal */}
          <Dialog
            open={Boolean(editing)}
            onOpenChange={(open) => {
              if (!open) {
                setEditing(null);
                setError("");
              }
            }}
          >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editing === "new"
                    ? users
                      ? "New user"
                      : "New profile"
                    : users
                      ? "Edit user"
                      : "Edit profile"}
                </DialogTitle>
                <DialogDescription>
                  {editing === "new"
                    ? users
                      ? "Create a new user account with assigned access profile and password."
                      : "Create a new access profile with custom permissions."
                    : users
                      ? `Update user details and status for ${editing ? editing.name : ""}.`
                      : `Update permissions and company access for ${editing ? editing.name : ""}.`}
                </DialogDescription>
              </DialogHeader>

              {error && (
                <p role="alert" className="text-down text-sm bg-down/10 border border-down/20 rounded p-3">
                  {error}
                </p>
              )}

              {editing && (
                <form
                  key={editing === "new" ? "new" : editing.id}
                  onSubmit={submit}
                  className="space-y-4 pt-1"
                >
                  <label className="block text-xs font-medium text-ink">
                    Name <span className="text-down">*</span>
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={120}
                      defaultValue={editing === "new" ? "" : editing.name}
                      className={control}
                      placeholder="Full name"
                    />
                  </label>

                  {users ? (
                    <>
                      <label className="block text-xs font-medium text-ink">
                        Email <span className="text-down">*</span>
                        <input
                          name="email"
                          type="email"
                          required
                          maxLength={254}
                          defaultValue={editing !== "new" && "email" in editing ? editing.email : ""}
                          className={control}
                          placeholder="user@example.com"
                        />
                      </label>
                      <label className="block text-xs font-medium text-ink">
                        Access profile <span className="text-down">*</span>
                        <select
                          name="profile_id"
                          required
                          defaultValue={
                            editing !== "new" && "profile_id" in editing
                              ? (editing.profile_id ?? "")
                              : ""
                          }
                          className={control}
                        >
                          <option value="" disabled>
                            Select a profile
                          </option>
                          {query.data?.profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-ink">
                        {editing === "new"
                          ? "Password (at least 12 characters)"
                          : "New password (optional)"}
                        <input
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          required={editing === "new"}
                          minLength={12}
                          maxLength={256}
                          className={control}
                          placeholder={editing === "new" ? "••••••••••••" : "Leave blank to keep current"}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer pt-1">
                        <input
                          name="active"
                          type="checkbox"
                          defaultChecked={
                            editing === "new" || ("active" in editing && editing.active)
                          }
                          className="rounded border-line"
                        />
                        Active user
                      </label>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-md border border-line p-3 bg-panel/50">
                        <label className="flex items-start gap-2 text-sm font-medium text-ink cursor-pointer">
                          <input
                            type="checkbox"
                            name="all_companies"
                            defaultChecked={
                              editing !== "new" && "all_companies" in editing && editing.all_companies
                            }
                            className="rounded border-line mt-0.5"
                          />
                          <span>Access to all companies (including future companies)</span>
                        </label>
                        <p className="text-xs text-ink3 mt-1 ml-6">
                          If unchecked, only the companies selected below will be accessible.
                        </p>
                        <div className="ml-6 mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                          {query.data?.companies.map((c) => (
                            <label key={c.id} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                              <input
                                type="checkbox"
                                name="company_ids"
                                value={c.id}
                                defaultChecked={
                                  editing !== "new" &&
                                  "company_ids" in editing &&
                                  editing.company_ids.includes(c.id)
                                }
                                className="rounded border-line"
                              />
                              <span>{c.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-ink uppercase tracking-wider">Module Permissions</p>
                        <ul className="divide-y divide-line rounded-md border border-line bg-white">
                          {Object.entries(permissions).map(([key, label]) => (
                            <li key={key} className="px-3 py-2.5">
                              <label className="flex items-center justify-between text-sm text-ink cursor-pointer">
                                <span>{label}</span>
                                <input
                                  type="checkbox"
                                  name={key}
                                  defaultChecked={
                                    editing !== "new" &&
                                    "system_admin" in editing &&
                                    !!editing[key as keyof typeof permissions]
                                  }
                                  className="rounded border-line"
                                />
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-3 border-t border-line">
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded border border-line px-4 py-2 text-sm text-ink2 hover:bg-canvas transition-colors cursor-pointer"
                      onClick={() => {
                        setEditing(null);
                        setError("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={button}
                      disabled={pending}
                    >
                      {pending ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
