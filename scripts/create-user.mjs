import pg from "pg";
import { randomBytes, scryptSync } from "node:crypto";

const [email, name] = process.argv.slice(2);
const password = process.env.LEDGER_INITIAL_PASSWORD;
if (
  !email ||
  !name ||
  !password ||
  password.length < 12 ||
  password.length > 256 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
) {
  console.error(
    'Use: LEDGER_INITIAL_PASSWORD (12 a 256 caracteres) e node --env-file=.env scripts/create-user.mjs email "Nome"',
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL no .env");
const salt = randomBytes(16).toString("hex");
const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query("INSERT INTO app_users (email, name, password_hash) VALUES ($1, $2, $3)", [
    email.trim().toLowerCase(),
    name,
    hash,
  ]);
  console.log("Usuário criado com sucesso.");
} finally {
  await pool.end();
}
