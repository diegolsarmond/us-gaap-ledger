import { db } from "./db.server";
import type { PoolClient } from "pg";
import { readSession } from "./auth.server";
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import type { z } from "zod";
import type {
  profileSchema,
  userSchema,
  Profile,
  ManagedUser,
  Permissions,
  AuditEvent,
} from "./admin-model";
export async function authorize(
  permission?: keyof Permissions,
  connection: Pick<PoolClient, "query"> = db(),
) {
  const user = await readSession(connection);
  if (user?.must_change_password)
    throw new Error("Change your password before accessing the system.");
  if (!user) throw new Error("Session expired. Sign in again.");
  const result = await connection.query(
    "SELECT p.* FROM app_users u LEFT JOIN access_profiles p ON p.id=u.profile_id WHERE u.id=$1 AND u.active=true",
    [user.id],
  );
  const profile = result.rows[0];
  if (permission && !profile?.[permission])
    throw new Error("Your profile does not allow this action.");
  return {
    user,
    permissions: {
      manage_users: !!profile?.manage_users,
      manage_profiles: !!profile?.manage_profiles,
      view_audit: !!profile?.view_audit,
      write_cash: !!profile?.write_cash,
      manage_companies: !!profile?.manage_companies,
      write_accounting: !!profile?.write_accounting,
      close_periods: !!profile?.close_periods,
    },
  };
}
const referenceLabels: Record<string, string> = {
  app_users: "user",
  journal_entries: "journal entry",
  journal_events: "journal event",
  cash_accounts: "cash account",
  cash_transactions: "cash transaction",
  cash_flow_reconciliations: "cash reconciliation",
};
/**
 * Rows referencing each id of `table`, discovered from foreign keys in the catalog so new
 * migrations are covered automatically. `owned` tables hold the record's own configuration
 * and are removed with it, so they never block a deletion.
 */
async function referenceUsage(
  connection: Pick<PoolClient, "query">,
  table: "app_users" | "access_profiles",
  owned: string[],
  id?: string,
) {
  const keys = await connection.query(
    `SELECT k.conrelid::regclass::text AS source,quote_ident(a.attname) AS column,cl.relname AS name
     FROM pg_constraint k JOIN pg_class cl ON cl.oid=k.conrelid
     JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
     WHERE k.contype='f' AND k.confrelid=$1::regclass AND array_length(k.conkey,1)=1
       AND k.confdeltype<>'c' AND NOT (cl.relname=ANY($2::text[]))`,
    [table, owned],
  );
  const usage = new Map<string, Map<string, number>>();
  for (const key of keys.rows as { source: string; column: string; name: string }[]) {
    const counts = await connection.query(
      `SELECT ${key.column}::text AS id,count(*)::int AS n FROM ${key.source}
       WHERE ${key.column} IS NOT NULL AND ($1::text IS NULL OR ${key.column}::text=$1) GROUP BY 1`,
      [id ?? null],
    );
    for (const row of counts.rows) {
      const entry = usage.get(row.id) ?? new Map<string, number>();
      const label = referenceLabels[key.name] ?? key.name.replace(/_/g, " ");
      entry.set(label, (entry.get(label) ?? 0) + row.n);
      usage.set(row.id, entry);
    }
  }
  return Object.fromEntries(
    [...usage].map(([rowId, entry]) => [
      rowId,
      [...entry].map(
        ([label, n]) =>
          `${n} ${n === 1 ? label : label.endsWith("y") ? label.slice(0, -1) + "ies" : label + "s"}`,
      ),
    ]),
  ) as Record<string, string[]>;
}
const profileOwned = ["profile_companies", "accounting_profile_permissions"];
export async function loadAdmin() {
  const { user, permissions } = await authorize();
  const profiles =
    permissions.manage_users || permissions.manage_profiles
      ? await db().query(
          "SELECT p.*,ARRAY(SELECT company_id FROM profile_companies WHERE profile_id=p.id) AS company_ids FROM access_profiles p ORDER BY name",
        )
      : { rows: [] };
  const users = permissions.manage_users
    ? await db().query("SELECT id,name,email,profile_id,active FROM app_users ORDER BY name")
    : { rows: [] };
  return {
    userUsage: permissions.manage_users ? await referenceUsage(db(), "app_users", []) : {},
    profileUsage: permissions.manage_profiles
      ? await referenceUsage(db(), "access_profiles", profileOwned)
      : {},
    companies: permissions.manage_profiles
      ? ((await db().query("SELECT id,name FROM companies ORDER BY name")).rows as {
          id: string;
          name: string;
        }[])
      : [],
    currentUserId: user.id,
    permissions,
    profiles: profiles.rows as Profile[],
    users: users.rows as ManagedUser[],
  };
}
export async function saveProfile(data: z.infer<typeof profileSchema>) {
  const { user } = await authorize("manage_profiles");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    await client.query("SELECT set_config('app.actor_id',$1,true)", [user.id]);
    const values = [
      data.name,
      data.manage_users,
      data.manage_profiles,
      data.view_audit,
      data.write_cash,
      data.manage_companies,
      data.write_accounting,
      data.close_periods,
      data.all_companies,
    ];
    let profileId = data.id;
    if (data.id) {
      const r = await client.query(
        "UPDATE access_profiles SET name=$1,manage_users=$2,manage_profiles=$3,view_audit=$4,write_cash=$5  ,manage_companies=$6,write_accounting=$7,close_periods=$8,all_companies=$9 WHERE id=$10 AND NOT system_admin RETURNING id",
        [...values, data.id],
      );
      if (!r.rowCount) throw new Error("Profile is protected or was not found.");
    } else {
      const created = await client.query(
        "INSERT INTO access_profiles(name,manage_users,manage_profiles,view_audit,write_cash,manage_companies,write_accounting,close_periods,all_companies) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        values,
      );
      profileId = created.rows[0].id;
    }
    await client.query("DELETE FROM profile_companies WHERE profile_id=$1", [profileId]);
    if (!data.all_companies)
      for (const companyId of new Set(data.company_ids))
        await client.query("INSERT INTO profile_companies(profile_id,company_id) VALUES($1,$2)", [
          profileId,
          companyId,
        ]);
    await client.query(
      "INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,after_data) VALUES($1,$2,'UPDATE_COMPANY_ACCESS','access_profiles',$3,$4)",
      [
        user.id,
        user.name,
        profileId,
        JSON.stringify({ all_companies: data.all_companies, company_ids: data.company_ids }),
      ],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new Error("A profile with this name already exists.");
    throw e;
  } finally {
    client.release();
  }
  return { ok: true };
}
export async function saveUser(data: z.infer<typeof userSchema>) {
  const { user } = await authorize("manage_users");
  if (!data.id && !data.password) throw new Error("Enter a password with at least 12 characters.");
  if (data.id === user.id && !data.active)
    throw new Error("You cannot deactivate your own access.");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    await client.query("SELECT set_config('app.actor_id',$1,true)", [user.id]);
    const profile = await client.query("SELECT id FROM access_profiles WHERE id=$1", [
      data.profile_id,
    ]);
    if (!profile.rowCount) throw new Error("Profile not found.");
    let hash: string | null = null;
    if (data.password) {
      const salt = randomBytes(16).toString("hex");
      hash = `${salt}:${scryptSync(data.password, salt, 64).toString("hex")}`;
    }
    if (data.id) {
      const r = await client.query(
        "UPDATE app_users SET name=$1,email=$2,profile_id=$3,active=$4,password_hash=coalesce($5,password_hash) WHERE id=$6 RETURNING id",
        [data.name, data.email.toLowerCase(), data.profile_id, data.active, hash, data.id],
      );
      if (!r.rowCount) throw new Error("User not found.");
    } else
      await client.query(
        "INSERT INTO app_users(name,email,profile_id,active,password_hash) VALUES($1,$2,$3,$4,$5)",
        [data.name, data.email.toLowerCase(), data.profile_id, data.active, hash],
      );
    const admins = await client.query(
      "SELECT u.id FROM app_users u JOIN access_profiles p ON p.id=u.profile_id WHERE u.active AND p.system_admin",
    );
    if (!admins.rowCount) throw new Error("Mantenha pelo menos um administrador ativo.");
    if (data.id)
      await client.query(
        "DELETE FROM app_sessions WHERE user_id=$1 AND ($2=false OR $3::text IS NOT NULL)",
        [data.id, data.active, hash],
      );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new Error("A user with this email already exists.");
    throw e;
  } finally {
    client.release();
  }
  return { ok: true };
}
export async function resetPassword(id: string) {
  const { user } = await authorize("manage_users");
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%&*?+-=",
  ];
  const alphabet = groups.join("");
  const characters = groups.map((group) => group[randomInt(group.length)]);
  while (characters.length < 20) characters.push(alphabet[randomInt(alphabet.length)]);
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  const password = characters.join("");
  const salt = randomBytes(16).toString("hex");
  const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.actor_id',$1,true)", [user.id]);
    const result = await client.query(
      "UPDATE app_users SET password_hash=$1,must_change_password=true WHERE id=$2 RETURNING id",
      [hash, id],
    );
    if (!result.rowCount) throw new Error("User not found.");
    await client.query("DELETE FROM app_sessions WHERE user_id=$1", [id]);
    await client.query("COMMIT");
    return { password };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function loadAudit(page: number, companyId?: string, search = "", action = "") {
  const auth = await authorize("view_audit");
  if (companyId) await (await import("./companies.server")).authorizeCompany(companyId);
  const result = await db().query(
    "SELECT id::text,occurred_at::text,actor_name,action,entity,target_id,before_data::text,after_data::text FROM system_audit_log WHERE (company_id=$2::uuid OR (company_id IS NULL AND $3)) AND ($4 = '' OR action=$4) AND ($5 = '' OR strpos(lower(concat_ws(' ',actor_name,entity,action,target_id)),lower($5)) > 0) ORDER BY occurred_at DESC,id DESC LIMIT 101 OFFSET $1",
    [
      (page - 1) * 100,
      companyId ?? null,
      auth.permissions.manage_users || auth.permissions.manage_profiles,
      action,
      search.trim(),
    ],
  );
  return { events: result.rows.slice(0, 100) as AuditEvent[], hasMore: result.rows.length > 100 };
}
export async function deleteUser(id: string) {
  const { user } = await authorize("manage_users");
  if (id === user.id) throw new Error("You cannot delete your own user.");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    await client.query("SELECT set_config('app.actor_id',$1,true)", [user.id]);
    const links = (await referenceUsage(client, "app_users", [], id))[id];
    if (links?.length)
      throw new Error(`This user is linked to ${links.join(", ")}. Deactivate it instead.`);
    const removed = await client.query("DELETE FROM app_users WHERE id=$1 RETURNING id", [id]);
    if (!removed.rowCount) throw new Error("User not found.");
    const admins = await client.query(
      "SELECT u.id FROM app_users u JOIN access_profiles p ON p.id=u.profile_id WHERE u.active AND p.system_admin",
    );
    if (!admins.rowCount) throw new Error("Keep at least one active administrator.");
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23503")
      throw new Error("This user has linked records. Deactivate it instead.");
    throw e;
  } finally {
    client.release();
  }
  return { ok: true };
}
export async function deleteProfile(id: string) {
  const { user } = await authorize("manage_profiles");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    await client.query("SELECT set_config('app.actor_id',$1,true)", [user.id]);
    const profile = await client.query(
      "SELECT system_admin FROM access_profiles WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!profile.rowCount) throw new Error("Profile not found.");
    if (profile.rows[0].system_admin) throw new Error("The administrator profile is protected.");
    const links = (await referenceUsage(client, "access_profiles", profileOwned, id))[id];
    if (links?.length) throw new Error(`This profile is linked to ${links.join(", ")}.`);
    for (const table of profileOwned)
      await client.query(`DELETE FROM ${table} WHERE profile_id=$1`, [id]);
    await client.query("DELETE FROM access_profiles WHERE id=$1", [id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23503")
      throw new Error("This profile has linked records and cannot be deleted.");
    throw e;
  } finally {
    client.release();
  }
  return { ok: true };
}
