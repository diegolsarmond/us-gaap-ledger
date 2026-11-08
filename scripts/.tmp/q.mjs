import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const co='d11094b7-d2c1-451e-9e09-fdb489f2b96c';
console.log((await c.query(`select f.account_code, f.feed_source_format, count(*) n,
 count(*) filter (where r.feed_external_posting ~* '^(added|matched) to:') posted,
 count(*) filter (where r.feed_external_posting ~* '^(added|matched) to:.*\m[0-9]{5}\M') with_code,
 min(r.date)::date::text, max(r.date)::date::text
 from ledger_stagingrows r join ledger_statements f on (f.company_id,f.id)=(r.company_id,r.file_id) where r.company_id=$1 group by 1,2`,[co])).rows);
console.log((await c.query(`select feed_external_posting from ledger_stagingrows where company_id=$1 and feed_external_posting ~* '^matched' limit 5`,[co])).rows);
await c.end();
