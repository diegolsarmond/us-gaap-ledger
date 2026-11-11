CREATE TABLE IF NOT EXISTS bank_report_balances (
  company_id uuid NOT NULL,
  account_code text NOT NULL,
  currency text NOT NULL,
  balance_date date NOT NULL,
  amount numeric(20,4) NOT NULL,
  PRIMARY KEY (company_id, account_code, balance_date),
  FOREIGN KEY (company_id, account_code) REFERENCES ledger_accounts(company_id, id) ON DELETE CASCADE
);
