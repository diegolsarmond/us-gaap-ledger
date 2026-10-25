import pg from "pg";
let pool: pg.Pool | undefined;
export function db() {
  if (!process.env["DATABASE_URL"])
    throw new Error("Configure DATABASE_URL e execute os scripts de banco.");
  return (pool ??= new pg.Pool({ connectionString: process.env["DATABASE_URL"], max: 5 }));
}
