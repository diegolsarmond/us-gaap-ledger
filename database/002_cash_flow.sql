BEGIN;
CREATE TABLE IF NOT EXISTS cash_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  name varchar(120) NOT NULL CHECK (length(trim(name)) > 0),
  currency varchar(3) NOT NULL CHECK (currency IN ('USD', 'BRL', 'EUR')),
  opening_date date NOT NULL,
  opening_balance numeric(16,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  UNIQUE (user_id, name)
);
CREATE TABLE IF NOT EXISTS cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  account_id uuid NOT NULL,
  description varchar(240) NOT NULL CHECK (length(trim(description)) > 0),
  category varchar(100) NOT NULL CHECK (length(trim(category)) > 0),
  direction varchar(3) NOT NULL CHECK (direction IN ('in', 'out')),
  amount numeric(16,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  paid_date date,
  status varchar(10) NOT NULL CHECK (status IN ('planned', 'paid', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'paid' AND paid_date IS NOT NULL) OR (status <> 'paid' AND paid_date IS NULL)),
  FOREIGN KEY (account_id, user_id) REFERENCES cash_accounts(id, user_id)
);
CREATE INDEX IF NOT EXISTS cash_transactions_user_dates_idx ON cash_transactions(user_id, due_date, paid_date);
CREATE INDEX IF NOT EXISTS cash_transactions_account_idx ON cash_transactions(account_id);
COMMIT;
