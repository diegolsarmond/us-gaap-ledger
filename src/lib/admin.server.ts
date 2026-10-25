import { db } from "./db.server";
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
export async function authorize(permission?: keyof Permissions) {
  const user = await readSession();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  const result = await db().query(
    "SELECT p.* FROM app_users u LEFT JOIN access_profiles p ON p.id=u.profile_id WHERE u.id=$1 AND u.active=true",
    [user.id],
  );
  const profile = result.rows[0];
  if (permission && !profile?.[permission]) throw new Error("Seu perfil não permite esta ação.");
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
export async function loadAdmin() {
  const { user, permissions } = await authorize();
  const profiles =
    permissions.manage_users || permissions.manage_profiles
      ? await db().query("SELECT p.*,ARRAY(SELECT company_id FROM profile_companies WHERE profile_id=p.id) AS company_ids FROM access_profiles p ORDER BY name")
      : { rows: [] };
  const users = permissions.manage_users
    ? await db().query("SELECT id,name,email,profile_id,active FROM app_users ORDER BY name")
    : { rows: [] };
  return {
    companies: permissions.manage_profiles ? (await db().query("SELECT id,data->>'name' AS name FROM companies ORDER BY data->>'name'")).rows as {id:string;name:string}[] : [],
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
      data.manage_companies,data.write_accounting,data.close_periods,data.all_companies,
    ];
    if (data.id) {
      const r = await client.query(
        "UPDATE access_profiles SET name=$1,manage_users=$2,manage_profiles=$3,view_audit=$4,write_cash=$5  ,manage_companies=$6,write_accounting=$7,close_periods=$8,all_companies=$9 WHERE id=$10 AND NOT system_admin RETURNING id",
        [...values, data.id],
      );
      if (!r.rowCount) throw new Error("Perfil protegido ou não encontrado.");
    } else
      await client.query(
        "INSERT INTO access_profiles(name,manage_users,manage_profiles,view_audit,write_cash) VALUES($1,$2,$3,$4,$5)",
        values,
      );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new Error("Já existe um perfil com esse nome.");
    throw e;
  } finally {
    client.release();
  }
  return { ok: true };
}
export async function saveUser(data: z.infer<typeof userSchema>) {
  const { user } = await authorize("manage_users");
  if (!data.id && !data.password)
    throw new Error("Informe uma senha com pelo menos 12 caracteres.");
  if (data.id === user.id && !data.active)
    throw new Error("Você não pode desativar seu próprio acesso.");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    await client.query("SELECT set_config('app.actor_id',$1,true)", [user.id]);
    const profile = await client.query("SELECT id FROM access_profiles WHERE id=$1", [
      data.profile_id,
    ]);
    if (!profile.rowCount) throw new Error("Perfil não encontrado.");
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
      if (!r.rowCount) throw new Error("Usuário não encontrado.");
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
      throw new Error("Já existe um usuário com esse e-mail.");
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
      "UPDATE app_users SET password_hash=$1 WHERE id=$2 RETURNING id",
      [hash, id],
    );
    if (!result.rowCount) throw new Error("Usuário não encontrado.");
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
export async function loadAudit(page: number) {
  await authorize("view_audit");
  const result = await db().query(
    "SELECT id::text,occurred_at::text,actor_name,action,entity,target_id,before_data::text,after_data::text FROM system_audit_log WHERE (company_id=$2::uuid OR (company_id IS NULL AND $3)) ORDER BY occurred_at DESC,id DESC LIMIT 101 OFFSET $1",
    [(page - 1) * 100,companyId??null,auth.permissions.manage_users||auth.permissions.manage_profiles],
  );
  return { events: result.rows.slice(0, 100) as AuditEvent[], hasMore: result.rows.length > 100 };
}
