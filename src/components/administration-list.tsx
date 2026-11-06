import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus } from "lucide-react";
import {
  loadAdministration,
  updateProfile,
  updateUser,
  resetUserPassword,
  deleteUser,
  deleteProfile,
} from "@/lib/admin";
import type { Profile, ManagedUser } from "@/lib/admin-model";
import { PageTitle, Panel, Table, Th, Td, Badge, Kpi } from "./ui-kit";
import {
  ConfirmDelete,
  DetailDialog,
  EmptyRow,
  IdentityCell,
  ListToolbar,
  PaginationBar,
  RowActions,
  fieldControl,
  primaryButton,
  secondaryButton,
  usePagination,
} from "./data-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const control = fieldControl;
const button = primaryButton;

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
  const [viewing, setViewing] = useState<ManagedUser | Profile | null>(null);
  const [removing, setRemoving] = useState<ManagedUser | Profile | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  async function confirmRemove() {
    if (!removing || pending) return;
    setPending(true);
    setRemoveError("");
    try {
      if (users) await deleteUser({ data: { id: removing.id } });
      else await deleteProfile({ data: { id: removing.id } });
      await client.invalidateQueries({ queryKey: ["administration"] });
      setNotice(`${removing.name} deleted and recorded in the audit log.`);
      setRemoving(null);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Unable to delete.");
    } finally {
      setPending(false);
    }
  }

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

  const data = query.data;
  const profileName = (id: string | null) =>
    data?.profiles.find((p) => p.id === id)?.name ?? "No profile";
  const companyName = (id: string) => data?.companies.find((c) => c.id === id)?.name ?? id;
  const usageOf = (id: string) =>
    (users ? data?.userUsage : data?.profileUsage)?.[id] ?? ([] as string[]);
  const grantedPermissions = (p: Profile) =>
    Object.entries(permissions)
      .filter(([key]) => p[key as keyof typeof permissions])
      .map(([, label]) => label);
  /** Why a row cannot be deleted, or null when no linked record would be affected. */
  function deleteBlock(r: ManagedUser | Profile) {
    if ("email" in r) {
      if (r.id === data?.currentUserId) return "You cannot delete your own user.";
    } else if (r.system_admin) return "The administrator profile is protected.";
    const links = usageOf(r.id);
    return links.length
      ? `Cannot delete: linked to ${links.join(", ")}.${"email" in r ? " Deactivate instead." : ""}`
      : null;
  }

  const term = search.trim().toLowerCase();
  const userRows = (data?.users ?? []).filter(
    (u) =>
      `${u.name} ${u.email} ${profileName(u.profile_id)}`.toLowerCase().includes(term) &&
      (!statusFilter || (statusFilter === "active") === u.active) &&
      (!groupFilter || (u.profile_id ?? "none") === groupFilter),
  );
  const profileRows = (data?.profiles ?? []).filter(
    (p) =>
      `${p.name} ${grantedPermissions(p).join(" ")}`.toLowerCase().includes(term) &&
      (!statusFilter || (statusFilter === "protected") === p.system_admin) &&
      (!groupFilter ||
        (groupFilter === "all"
          ? p.all_companies || p.system_admin
          : !p.all_companies && !p.system_admin)),
  );
  const rows: (ManagedUser | Profile)[] = users ? userRows : profileRows;
  const paging = usePagination(rows, `${term}|${statusFilter}|${groupFilter}|${kind}`);
  const usersPerProfile = (id: string) =>
    data?.users.filter((u) => u.profile_id === id).length ?? 0;
  const columns = users ? 5 : 6;

  function openEdit(r: ManagedUser | Profile) {
    setViewing(null);
    setEditing(r);
    setError("");
    setNotice("");
  }
  function openDelete(r: ManagedUser | Profile) {
    setViewing(null);
    setRemoving(r);
    setRemoveError("");
    setNotice("");
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title={users ? "Users" : "Access profiles"}
        description={
          users
            ? "System users, their access profile and status. Users with activity can only be deactivated."
            : "Permission sets and company access assigned to users."
        }
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
              <Plus className="size-4" />
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
      {allowed && data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {users ? (
              <>
                <Kpi label="Users" value={String(data.users.length)} />
                <Kpi label="Active" value={String(data.users.filter((u) => u.active).length)} />
                <Kpi label="Inactive" value={String(data.users.filter((u) => !u.active).length)} />
                <Kpi
                  label="Profiles in use"
                  value={String(new Set(data.users.map((u) => u.profile_id)).size)}
                />
              </>
            ) : (
              <>
                <Kpi label="Profiles" value={String(data.profiles.length)} />
                <Kpi
                  label="Protected"
                  value={String(data.profiles.filter((p) => p.system_admin).length)}
                />
                <Kpi
                  label="All companies"
                  value={String(
                    data.profiles.filter((p) => p.all_companies || p.system_admin).length,
                  )}
                />
                <Kpi
                  label="Unassigned"
                  value={String(
                    data.profiles.filter((p) => !usageOf(p.id).length && !p.system_admin).length,
                  )}
                />
              </>
            )}
          </div>
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder={
              users ? "Search by name, email or profile…" : "Search by name or permission…"
            }
            filters={
              users
                ? [
                    {
                      key: "status",
                      label: "Status",
                      value: statusFilter,
                      onChange: setStatusFilter,
                      options: [
                        { value: "active", label: "Active" },
                        { value: "inactive", label: "Inactive" },
                      ],
                    },
                    {
                      key: "profile",
                      label: "Profile",
                      value: groupFilter,
                      onChange: setGroupFilter,
                      options: [
                        ...data.profiles.map((p) => ({ value: p.id, label: p.name })),
                        { value: "none", label: "No profile" },
                      ],
                    },
                  ]
                : [
                    {
                      key: "type",
                      label: "Type",
                      value: statusFilter,
                      onChange: setStatusFilter,
                      options: [
                        { value: "protected", label: "Protected" },
                        { value: "custom", label: "Customizable" },
                      ],
                    },
                    {
                      key: "scope",
                      label: "Company access",
                      value: groupFilter,
                      onChange: setGroupFilter,
                      options: [
                        { value: "all", label: "All companies" },
                        { value: "selected", label: "Selected companies" },
                      ],
                    },
                  ]
            }
          />
          <Panel
            title={`${users ? "Users" : "Access profiles"}`}
            subtitle={`${rows.length} of ${(users ? data.users : data.profiles).length} records`}
          >
            <Table>
              <thead className="bg-canvas/50">
                <tr>
                  <Th>{users ? "User" : "Profile"}</Th>
                  {users ? (
                    <>
                      <Th>Profile</Th>
                      <Th>Status</Th>
                      <Th>Activity</Th>
                    </>
                  ) : (
                    <>
                      <Th>Permissions</Th>
                      <Th>Company access</Th>
                      <Th align="right">Users</Th>
                      <Th>Type</Th>
                    </>
                  )}
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {paging.pageRows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-brand/[0.03]">
                    {"email" in r ? (
                      <>
                        <Td>
                          <IdentityCell
                            title={r.name}
                            subtitle={r.id === data.currentUserId ? `${r.email} · you` : r.email}
                          />
                        </Td>
                        <Td>{profileName(r.profile_id)}</Td>
                        <Td>
                          <Badge tone={r.active ? "up" : "neutral"}>
                            {r.active ? "Active" : "Inactive"}
                          </Badge>
                        </Td>
                        <Td className="text-[12px] text-ink3">
                          {usageOf(r.id).join(" · ") || "No linked records"}
                        </Td>
                      </>
                    ) : (
                      <>
                        <Td>
                          <IdentityCell
                            title={r.name}
                            subtitle={`${grantedPermissions(r).length} of ${Object.keys(permissions).length} permissions`}
                          />
                        </Td>
                        <Td>
                          <div className="flex max-w-md flex-wrap gap-1">
                            {grantedPermissions(r).map((label) => (
                              <Badge key={label}>{label}</Badge>
                            ))}
                            {!grantedPermissions(r).length && (
                              <span className="text-ink3">Read-only</span>
                            )}
                          </div>
                        </Td>
                        <Td>
                          {r.system_admin || r.all_companies
                            ? "All companies"
                            : `${r.company_ids.length} selected`}
                        </Td>
                        <Td align="right">{usersPerProfile(r.id)}</Td>
                        <Td>
                          <Badge tone={r.system_admin ? "brand" : "neutral"}>
                            {r.system_admin ? "Protected" : "Customizable"}
                          </Badge>
                        </Td>
                      </>
                    )}
                    <Td align="right">
                      <RowActions
                        onView={() => setViewing(r)}
                        onEdit={() => openEdit(r)}
                        edit={{
                          blocked: pending
                            ? "Please wait…"
                            : "system_admin" in r && r.system_admin
                              ? "The administrator profile is protected."
                              : null,
                        }}
                        onDelete={() => openDelete(r)}
                        remove={{ blocked: pending ? "Please wait…" : deleteBlock(r) }}
                        extra={
                          "email" in r ? (
                            <button
                              type="button"
                              disabled={pending}
                              title="Reset password"
                              aria-label="Reset password"
                              className="inline-flex size-8 items-center justify-center rounded-md text-ink3 transition-colors hover:bg-canvas hover:text-ink disabled:opacity-35 cursor-pointer"
                              onClick={() => {
                                setResetTarget(r);
                                setGeneratedPassword("");
                                setCopied(false);
                                setEditing(null);
                                setError("");
                                setNotice("");
                              }}
                            >
                              <KeyRound className="size-4" />
                            </button>
                          ) : undefined
                        }
                      />
                    </Td>
                  </tr>
                ))}
                {!rows.length && (
                  <EmptyRow colSpan={columns}>
                    {(users ? data.users : data.profiles).length
                      ? "No records match the current filters."
                      : "No records registered yet."}
                  </EmptyRow>
                )}
              </tbody>
            </Table>
            <PaginationBar {...paging} />
          </Panel>

          <DetailDialog
            open={Boolean(viewing)}
            onClose={() => setViewing(null)}
            title={viewing?.name ?? ""}
            subtitle={
              viewing && "email" in viewing
                ? viewing.email
                : viewing?.system_admin
                  ? "Protected administrator profile"
                  : "Customizable profile"
            }
            sections={
              !viewing
                ? []
                : "email" in viewing
                  ? [
                      {
                        title: "Account",
                        fields: [
                          { label: "Name", value: viewing.name },
                          { label: "Email", value: viewing.email },
                          { label: "Access profile", value: profileName(viewing.profile_id) },
                          {
                            label: "Status",
                            value: (
                              <Badge tone={viewing.active ? "up" : "neutral"}>
                                {viewing.active ? "Active" : "Inactive"}
                              </Badge>
                            ),
                          },
                          {
                            label: "Linked records",
                            value: usageOf(viewing.id).join(" · ") || "None",
                            wide: true,
                          },
                        ],
                      },
                    ]
                  : [
                      {
                        title: "Permissions",
                        fields: Object.entries(permissions).map(([key, label]) => ({
                          label,
                          value: viewing[key as keyof typeof permissions] ? (
                            <Badge tone="up">Allowed</Badge>
                          ) : (
                            <Badge>Not allowed</Badge>
                          ),
                        })),
                      },
                      {
                        title: "Company access",
                        fields: [
                          {
                            label: "Scope",
                            value:
                              viewing.system_admin || viewing.all_companies
                                ? "All companies, including future ones"
                                : "Selected companies only",
                            wide: true,
                          },
                          ...(viewing.system_admin || viewing.all_companies
                            ? []
                            : [
                                {
                                  label: "Companies",
                                  value: viewing.company_ids.map(companyName).join(", ") || "None",
                                  wide: true,
                                },
                              ]),
                          { label: "Users assigned", value: String(usersPerProfile(viewing.id)) },
                          {
                            label: "Linked records",
                            value: usageOf(viewing.id).join(" · ") || "None",
                          },
                        ],
                      },
                    ]
            }
            footer={
              viewing && (
                <>
                  {!deleteBlock(viewing) && (
                    <button
                      type="button"
                      className={`${secondaryButton} text-down`}
                      onClick={() => openDelete(viewing)}
                    >
                      Delete
                    </button>
                  )}
                  {!("system_admin" in viewing && viewing.system_admin) && (
                    <button type="button" className={button} onClick={() => openEdit(viewing)}>
                      Edit
                    </button>
                  )}
                </>
              )
            }
          />

          <ConfirmDelete
            target={removing?.name ?? null}
            entity={users ? "user" : "access profile"}
            pending={pending}
            error={removeError}
            onCancel={() => setRemoving(null)}
            onConfirm={() => void confirmRemove()}
          />

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
                <p
                  role="alert"
                  className="text-down text-sm bg-down/10 border border-down/20 rounded p-3"
                >
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
                        className={secondaryButton}
                        onClick={() => {
                          setResetTarget(null);
                          setGeneratedPassword("");
                          setCopied(false);
                        }}
                      >
                        Close
                      </button>
                      <button type="button" className={button} onClick={() => void copyPassword()}>
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
                        className={secondaryButton}
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
                <p
                  role="alert"
                  className="text-down text-sm bg-down/10 border border-down/20 rounded p-3"
                >
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
                          defaultValue={
                            editing !== "new" && "email" in editing ? editing.email : ""
                          }
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
                          placeholder={
                            editing === "new" ? "••••••••••••" : "Leave blank to keep current"
                          }
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
                              editing !== "new" &&
                              "all_companies" in editing &&
                              editing.all_companies
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
                            <label
                              key={c.id}
                              className="flex items-center gap-2 text-sm text-ink cursor-pointer"
                            >
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
                        <p className="text-xs font-semibold text-ink uppercase tracking-wider">
                          Module Permissions
                        </p>
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
                      className={secondaryButton}
                      onClick={() => {
                        setEditing(null);
                        setError("");
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={button} disabled={pending}>
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
