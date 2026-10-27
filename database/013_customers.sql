BEGIN;
CREATE TABLE IF NOT EXISTS ledger_customers (
 company_id uuid NOT NULL REFERENCES companies(id), id text NOT NULL,
 position integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY(company_id,id),
 CHECK (length(trim(data->>'displayName')) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_customers_display_name ON ledger_customers(company_id, lower(data->>'displayName'));
COMMIT;
