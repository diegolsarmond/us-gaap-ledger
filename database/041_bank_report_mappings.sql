CREATE TABLE IF NOT EXISTS bank_report_mappings (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_group text NOT NULL,
  account_code text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  PRIMARY KEY (company_id, source_group),
  FOREIGN KEY (company_id, account_code) REFERENCES ledger_accounts(company_id, id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
