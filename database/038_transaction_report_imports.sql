CREATE TABLE IF NOT EXISTS transaction_report_imports (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  account_code text NOT NULL,
  source_group text NOT NULL,
  file_name text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 5000),
  content text NOT NULL,
  digest text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, account_code, source_group, currency, digest),
  FOREIGN KEY (company_id, account_code) REFERENCES ledger_accounts(company_id, id)
    DEFERRABLE INITIALLY DEFERRED
);
