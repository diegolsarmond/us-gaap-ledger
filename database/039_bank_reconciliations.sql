BEGIN;

-- Formal bank reconciliation per company, bank/credit card account and statement period.
-- Reconciling only records which existing Bank Feed lines the bank cleared: it never creates
-- journals and never changes ledger_stagingrows, bank_feed_attempts or bank_feed_links.
CREATE TABLE IF NOT EXISTS bank_reconciliations (
 company_id uuid NOT NULL REFERENCES companies(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 account_code text NOT NULL,
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 period_start date NOT NULL,
 period_end date NOT NULL,
 beginning_balance numeric(20,4) NOT NULL,
 statement_ending_balance numeric(20,4) NOT NULL,
 cleared_balance numeric(20,4) NOT NULL,
 difference numeric(20,4) NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed','reopened')),
 notes text,
 created_by uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_by uuid REFERENCES app_users(id),
 completed_at timestamptz,
 reopened_by uuid REFERENCES app_users(id),
 reopened_at timestamptz,
 reopen_reason text,
 PRIMARY KEY (company_id, id),
 FOREIGN KEY (company_id, account_code) REFERENCES ledger_accounts(company_id, id)
   DEFERRABLE INITIALLY DEFERRED,
 CHECK (period_start <= period_end),
 CHECK (difference = statement_ending_balance - cleared_balance),
 CHECK (status <> 'completed' OR (difference = 0 AND completed_by IS NOT NULL AND completed_at IS NOT NULL)),
 CHECK (status <> 'reopened' OR (reopened_by IS NOT NULL AND reopened_at IS NOT NULL AND reopen_reason IS NOT NULL))
);
-- One editable reconciliation per account at a time keeps beginning balances sequential.
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_open_account
 ON bank_reconciliations(company_id, account_code) WHERE status <> 'completed';
CREATE INDEX IF NOT EXISTS bank_reconciliation_by_account
 ON bank_reconciliations(company_id, account_code, period_end DESC);

-- Cleared statement lines. A Bank Feed line is reconciled at most once.
CREATE TABLE IF NOT EXISTS bank_reconciliation_items (
 company_id uuid NOT NULL,
 reconciliation_id uuid NOT NULL,
 row_id text NOT NULL,
 amount numeric(20,4) NOT NULL,
 attempt_id uuid,
 cleared_by uuid NOT NULL REFERENCES app_users(id),
 cleared_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (company_id, reconciliation_id, row_id),
 UNIQUE (company_id, row_id),
 FOREIGN KEY (company_id, reconciliation_id) REFERENCES bank_reconciliations(company_id, id) ON DELETE CASCADE,
 -- Deferred like bank_feed_attempts: structured ledger saves rewrite staging rows inside one transaction.
 FOREIGN KEY (company_id, row_id) REFERENCES ledger_stagingrows(company_id, id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY (company_id, attempt_id) REFERENCES bank_feed_attempts(company_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS bank_reconciliation_items_by_attempt
 ON bank_reconciliation_items(company_id, attempt_id) WHERE attempt_id IS NOT NULL;

-- Append-only history: who created, edited, cleared, completed or reopened, and when.
CREATE TABLE IF NOT EXISTS bank_reconciliation_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id uuid NOT NULL,
 reconciliation_id uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('created','updated','cleared','uncleared','completed','reopened','deleted')),
 actor_id uuid REFERENCES app_users(id),
 actor_name text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS bank_reconciliation_events_by_reconciliation
 ON bank_reconciliation_events(company_id, reconciliation_id, occurred_at DESC, id DESC);
CREATE OR REPLACE FUNCTION bank_reconciliation_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Bank reconciliation history is append-only.';
END $$;
DROP TRIGGER IF EXISTS bank_reconciliation_events_immutable ON bank_reconciliation_events;
CREATE TRIGGER bank_reconciliation_events_immutable BEFORE UPDATE OR DELETE ON bank_reconciliation_events
 FOR EACH ROW EXECUTE FUNCTION bank_reconciliation_events_append_only();

-- A completed reconciliation only moves to 'reopened'; its figures and items are frozen.
CREATE OR REPLACE FUNCTION guard_bank_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
   IF OLD.status = 'completed' OR OLD.completed_at IS NOT NULL THEN
     RAISE EXCEPTION 'A reconciliation that was completed cannot be deleted.';
   END IF;
   RETURN OLD;
 END IF;
 IF OLD.status = 'completed' AND NOT (
   NEW.status = 'reopened'
   AND (NEW.company_id, NEW.id, NEW.account_code, NEW.currency, NEW.period_start, NEW.period_end,
        NEW.beginning_balance, NEW.statement_ending_balance, NEW.cleared_balance, NEW.difference)
     IS NOT DISTINCT FROM
       (OLD.company_id, OLD.id, OLD.account_code, OLD.currency, OLD.period_start, OLD.period_end,
        OLD.beginning_balance, OLD.statement_ending_balance, OLD.cleared_balance, OLD.difference)
 ) THEN
   RAISE EXCEPTION 'Completed reconciliations must be reopened before they change.';
 END IF;
 IF (NEW.company_id, NEW.account_code, NEW.currency, NEW.period_start)
    IS DISTINCT FROM (OLD.company_id, OLD.account_code, OLD.currency, OLD.period_start) THEN
   RAISE EXCEPTION 'Reconciliation account, currency and period start cannot change.';
 END IF;
 NEW.updated_at := now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bank_reconciliation_guard ON bank_reconciliations;
CREATE TRIGGER bank_reconciliation_guard BEFORE UPDATE OR DELETE ON bank_reconciliations
 FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation();

-- Items must belong to the reconciled account/currency, fall inside the statement period end,
-- and cannot change once the reconciliation is completed.
CREATE OR REPLACE FUNCTION guard_bank_reconciliation_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rec bank_reconciliations%ROWTYPE; line record;
BEGIN
 SELECT * INTO rec FROM bank_reconciliations
  WHERE company_id = coalesce(NEW.company_id, OLD.company_id)
    AND id = coalesce(NEW.reconciliation_id, OLD.reconciliation_id);
 -- Cascade from a deleted (never completed) parent.
 IF NOT FOUND THEN
   IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
   RAISE EXCEPTION 'Reconciliation unavailable.';
 END IF;
 IF rec.status = 'completed' THEN
   RAISE EXCEPTION 'Completed reconciliations must be reopened before cleared items change.';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 SELECT r.date, r.status, f.account_code, f.feed_currency INTO line
  FROM ledger_stagingrows r JOIN ledger_statements f ON (f.company_id, f.id) = (r.company_id, r.file_id)
  WHERE r.company_id = NEW.company_id AND r.id = NEW.row_id;
 IF NOT FOUND OR line.account_code <> rec.account_code OR line.feed_currency <> rec.currency THEN
   RAISE EXCEPTION 'Bank Feed line does not belong to the reconciled account.';
 END IF;
 IF line.date > rec.period_end THEN
   RAISE EXCEPTION 'Bank Feed line is dated after the statement ending date.';
 END IF;
 IF line.status = 'Excluded' THEN
   RAISE EXCEPTION 'Excluded Bank Feed lines cannot be reconciled.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bank_reconciliation_item_guard ON bank_reconciliation_items;
CREATE TRIGGER bank_reconciliation_item_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_reconciliation_items
 FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_item();

-- Undo/unmatch of a line inside a completed reconciliation would silently break it.
CREATE OR REPLACE FUNCTION guard_reconciled_bank_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state = 'posted' AND NEW.state <> 'posted' AND EXISTS (
   SELECT 1 FROM bank_reconciliation_items i
   JOIN bank_reconciliations b ON (b.company_id, b.id) = (i.company_id, i.reconciliation_id)
   WHERE i.company_id = OLD.company_id AND i.row_id = OLD.row_id AND b.status = 'completed'
 ) THEN
   RAISE EXCEPTION 'This transaction is part of a completed bank reconciliation. Reopen the reconciliation first.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bank_feed_attempt_reconciled ON bank_feed_attempts;
CREATE TRIGGER bank_feed_attempt_reconciled BEFORE UPDATE OF state ON bank_feed_attempts
 FOR EACH ROW EXECUTE FUNCTION guard_reconciled_bank_attempt();

DROP TRIGGER IF EXISTS audit_bank_reconciliations ON bank_reconciliations;
CREATE TRIGGER audit_bank_reconciliations AFTER INSERT OR UPDATE OR DELETE ON bank_reconciliations
 FOR EACH ROW EXECUTE FUNCTION record_system_audit();

COMMIT;
