import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";

let pool: pg.Pool | undefined;
function db() {
  if (!process.env["DATABASE_URL"])
    throw new Error("Configure DATABASE_URL e execute os scripts de banco.");
  return (pool ??= new pg.Pool({ connectionString: process.env["DATABASE_URL"], max: 5 }));
}
const cookie = "ledgerx_session";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function readSession() {
  const token = getCookie(cookie);
  if (!token) return null;
  const result = await db().query(
    `SELECT u.id, u.email, u.name FROM app_sessions s JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`,
    [digest(token)],
  );
  return (result.rows[0] as { id: string; email: string; name: string } | undefined) ?? null;
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
    return { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." };
  const result = await connection.query(
    "SELECT * FROM app_users WHERE email = $1 AND active = true",
    [key],
  );
  const user = result.rows[0];
  const [salt, hash] = (user?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`).split(":");
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (!user || stored.length !== candidate.length || !timingSafeEqual(candidate, stored)) {
    return { error: "E-mail ou senha inválidos." };
  }
  const previous = getCookie(cookie);
  if (previous)
    await connection.query("DELETE FROM app_sessions WHERE token_hash = $1", [digest(previous)]);
  const token = randomBytes(32).toString("hex");
  await connection.query("DELETE FROM app_sessions WHERE expires_at <= now()");
  await connection.query(
    "INSERT INTO app_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '8 hours')",
    [user.id, digest(token)],
  );
  setCookie(cookie, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  await connection.query("DELETE FROM login_attempts WHERE email = $1", [key]);
  return { error: null };
}

export async function signOut() {
  const token = getCookie(cookie);
  if (token) await db().query("DELETE FROM app_sessions WHERE token_hash = $1", [digest(token)]);
  deleteCookie(cookie, { path: "/" });
}
