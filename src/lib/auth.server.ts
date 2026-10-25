import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.server";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";

const cookie = "ledgerx_session";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function readSession() {
  const token = getCookie(cookie);
  if (!token) return null;
  const result = await db().query(
    `SELECT u.id, u.email, u.name, u.must_change_password FROM app_sessions s JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`,
    [digest(token)],
  );
  return (
    (result.rows[0] as
      { id: string; email: string; name: string; must_change_password: boolean } | undefined) ??
    null
  );
}

export async function signIn(email: string, password: string) {
  const connection = db();
  const key = email.trim().toLowerCase();
  // Persisted throttling also applies across server instances and restarts.
  const attempts = await connection.query(
    `INSERT INTO login_attempts (email, attempts, window_start) VALUES ($1, 1, now())
     ON CONFLICT (email) DO UPDATE SET
       attempts = CASE WHEN login_attempts.window_start < now() - interval '15 minutes' THEN 1 ELSE login_attempts.attempts + 1 END,
       window_start = CASE WHEN login_attempts.window_start < now() - interval '15 minutes' THEN now() ELSE login_attempts.window_start END
     RETURNING attempts`,
    [key],
  );
  if (attempts.rows[0].attempts > 10)
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  const result = await connection.query(
    "SELECT * FROM app_users WHERE email = $1 AND active = true",
    [key],
  );
  const user = result.rows[0];
  const [salt, hash] = (user?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`).split(":");
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (!user || stored.length !== candidate.length || !timingSafeEqual(candidate, stored)) {
    return { error: "Invalid email or password." };
  }
  const client = await connection.connect();
  const token = randomBytes(32).toString("hex");
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT password_hash FROM app_users WHERE id=$1 AND active=true FOR UPDATE",
      [user.id],
    );
    if (current.rows[0]?.password_hash !== user.password_hash) {
      await client.query("ROLLBACK");
      return { error: "A senha foi alterada. Entre novamente." };
    }
    const previous = getCookie(cookie);
    if (previous)
      await client.query("DELETE FROM app_sessions WHERE token_hash = $1", [digest(previous)]);
    await client.query("DELETE FROM app_sessions WHERE expires_at <= now()");
    await client.query(
      "INSERT INTO app_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '8 hours')",
      [user.id, digest(token)],
    );
    await client.query(
      "INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id) VALUES($1,$2,'LOGIN','app_users',$3)",
      [user.id, user.name, user.id],
    );
    await client.query("DELETE FROM login_attempts WHERE email=$1", [key]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  setCookie(cookie, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return { error: null };
}

export async function signOut() {
  const token = getCookie(cookie);
  if (token) await db().query("DELETE FROM app_sessions WHERE token_hash = $1", [digest(token)]);
  deleteCookie(cookie, { path: "/" });
}

export async function registerUser(name: string, email: string, password: string) {
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const result = await db().query(
    `INSERT INTO app_users (name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [name.trim(), email.trim().toLowerCase(), passwordHash],
  );
  if (!result.rowCount) return { error: "Já existe um usuário com este e-mail." };
  return { error: null };
}

export async function changeRequiredPassword(password: string) {
  const user = await readSession();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT password_hash,must_change_password FROM app_users WHERE id=$1 AND active=true FOR UPDATE",
      [user.id],
    );
    const current = result.rows[0];
    if (!current?.must_change_password || !(await readSession()))
      throw new Error("Sessão inválida. Entre novamente.");
    const [oldSalt, oldHash] = current.password_hash.split(":");
    if (timingSafeEqual(scryptSync(password, oldSalt, 64), Buffer.from(oldHash, "hex")))
      throw new Error("A nova senha deve ser diferente da senha temporária.");
    const salt = randomBytes(16).toString("hex");
    const hash = salt + ":" + scryptSync(password, salt, 64).toString("hex");
    await client.query("SELECT set_config('app.actor_id',$1,true)", [user.id]);
    await client.query(
      "UPDATE app_users SET password_hash=$1,must_change_password=false WHERE id=$2",
      [hash, user.id],
    );
    await client.query("DELETE FROM app_sessions WHERE user_id=$1 AND token_hash<>$2", [
      user.id,
      digest(getCookie(cookie)!),
    ]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
