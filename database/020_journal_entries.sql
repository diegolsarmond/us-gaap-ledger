BEGIN;
-- This application uses one deployment per tenant. Never accept tenant IDs from requests.
CREATE TABLE accounting_tenant (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid());
INSERT INTO accounting_tenant(singleton) VALUES(true);
CREATE TABLE accounting_policies (
 company_id uuid PRIMARY KEY REFERENCES companies(id), approval_required boolean NOT NULL DEFAULT true,
 segregate_approval boolean NOT NULL DEFAULT true, opening_date date, next_number bigint NOT NULL DEFAULT 1 CHECK(next_number>0)
);
CREATE TABLE accounting_profile_permissions (
 profile_id uuid PRIMARY KEY REFERENCES access_profiles(id), can_approve boolean NOT NULL DEFAULT false,
 can_post boolean NOT NULL DEFAULT false, can_reverse boolean NOT NULL DEFAULT false,
 can_soft_close boolean NOT NULL DEFAULT false
);
INSERT INTO accounting_profile_permissions SELECT id,system_admin,system_admin,system_admin,system_admin FROM access_profiles;
CREATE TABLE journal_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES accounting_tenant(id),
 company_id uuid NOT NULL REFERENCES companies(id), journal_number text, journal_type text NOT NULL CHECK(journal_type IN ('Manual','Automatic','Adjustment','Opening','Reclassification','Reversal')),
 accounting_date date NOT NULL, fiscal_period_id text NOT NULL, description text NOT NULL CHECK(length(trim(description))>0), reference text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Pending Approval','Approved','Rejected','Posted')),
 transaction_currency text NOT NULL, functional_currency text NOT NULL DEFAULT 'USD', exchange_rate numeric(24,12) NOT NULL CHECK(exchange_rate>0), exchange_rate_source text NOT NULL,
 source_module text NOT NULL DEFAULT 'Journal Entries', source_type text NOT NULL DEFAULT 'Manual', source_id text NOT NULL DEFAULT '', source_event_id text, source_event_version integer, idempotency_key text, payload_hash text,
 created_by uuid NOT NULL REFERENCES app_users(id), approved_by uuid REFERENCES app_users(id), posted_by uuid REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, posted_at timestamptz,
 reversal_of_entry_id uuid, version integer NOT NULL DEFAULT 1,
 UNIQUE(tenant_id,company_id,id), UNIQUE(company_id,journal_number), UNIQUE(company_id,source_module,idempotency_key), UNIQUE(company_id,source_module,source_event_id,source_event_version), UNIQUE(reversal_of_entry_id),
 FOREIGN KEY(company_id,fiscal_period_id) REFERENCES ledger_fiscalperiods(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,company_id,reversal_of_entry_id) REFERENCES journal_entries(tenant_id,company_id,id)
);
CREATE TABLE journal_entry_lines (
 tenant_id uuid NOT NULL, company_id uuid NOT NULL, journal_entry_id uuid NOT NULL, line_number integer NOT NULL,
 account_code text NOT NULL, description text NOT NULL DEFAULT '', debit numeric(20,4) NOT NULL, credit numeric(20,4) NOT NULL,
 base_debit numeric(20,4) NOT NULL, base_credit numeric(20,4) NOT NULL, cost_center_id text, project_id text, customer_id text, vendor_id text,
 PRIMARY KEY(journal_entry_id,line_number),
 FOREIGN KEY(tenant_id,company_id,journal_entry_id) REFERENCES journal_entries(tenant_id,company_id,id),
 FOREIGN KEY(company_id,account_code) REFERENCES ledger_accounts(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(company_id,cost_center_id) REFERENCES ledger_costcenters(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(company_id,project_id) REFERENCES ledger_projects(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(company_id,customer_id) REFERENCES ledger_customers(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(company_id,vendor_id) REFERENCES ledger_vendors(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(debit>=0 AND credit>=0 AND ((debit>0 AND credit=0) OR (credit>0 AND debit=0))), CHECK(base_debit>=0 AND base_credit>=0)
);
CREATE TABLE journal_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, journal_entry_id uuid NOT NULL REFERENCES journal_entries(id),
 actor_id uuid NOT NULL REFERENCES app_users(id), occurred_at timestamptz NOT NULL DEFAULT now(), action text NOT NULL, reason text NOT NULL DEFAULT '', audit_event_id bigint NOT NULL REFERENCES system_audit_events(id)
);
CREATE TABLE journal_account_rules (
 company_id uuid NOT NULL REFERENCES companies(id), account_code text NOT NULL, active boolean NOT NULL DEFAULT true,
 posting_allowed boolean NOT NULL DEFAULT true, valid_from date, valid_to date, cost_center_required boolean NOT NULL DEFAULT false,
 PRIMARY KEY(company_id,account_code), CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_from<=valid_to)
);
CREATE UNIQUE INDEX journal_one_opening ON journal_entries(company_id) WHERE status='Posted' AND journal_type='Opening';
CREATE INDEX journal_scope_idx ON journal_entries(tenant_id,company_id,accounting_date,status);
CREATE INDEX journal_account_idx ON journal_entry_lines(company_id,account_code,journal_entry_id);
CREATE FUNCTION protect_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status='Posted' THEN RAISE EXCEPTION 'Journal records cannot be deleted; posted journals are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER journal_immutable BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION protect_journal();
CREATE FUNCTION protect_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM journal_entries WHERE (id=NEW.journal_entry_id OR id=OLD.journal_entry_id) AND status='Posted') THEN RAISE EXCEPTION 'Posted journal lines are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER journal_line_immutable BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines FOR EACH ROW EXECUTE FUNCTION protect_journal_line();
CREATE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='Posted' AND (SELECT count(*)<2 OR coalesce(sum(debit-credit),1)<>0 OR coalesce(sum(base_debit-base_credit),1)<>0 FROM journal_entry_lines WHERE journal_entry_id=NEW.id) THEN RAISE EXCEPTION 'Journal must balance in transaction and functional currencies'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER journal_balance AFTER INSERT OR UPDATE ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
CREATE FUNCTION protect_journal_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Journal audit is append only'; END $$;
CREATE TRIGGER journal_event_immutable BEFORE UPDATE OR DELETE ON journal_events FOR EACH ROW EXECUTE FUNCTION protect_journal_event();
COMMIT;
