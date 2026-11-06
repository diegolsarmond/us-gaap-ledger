BEGIN;
SELECT pg_advisory_xact_lock(803003);
ALTER TABLE ledger_vendors
 ADD COLUMN IF NOT EXISTS cc text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bcc text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS other_contact text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS street_address2 text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS cost_rate numeric CHECK(cost_rate >= 0),
 ADD COLUMN IF NOT EXISTS billing_rate numeric CHECK(billing_rate >= 0);
CREATE TABLE IF NOT EXISTS ledger_vendors_addresslines (
 company_id uuid NOT NULL,
 parent_id text NOT NULL,
 position integer NOT NULL,
 line text NOT NULL CHECK(length(btrim(line)) BETWEEN 1 AND 300),
 PRIMARY KEY(company_id,parent_id,position),
 FOREIGN KEY(company_id,parent_id) REFERENCES ledger_vendors(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS ledger_vendors_customfields (
 company_id uuid NOT NULL,
 parent_id text NOT NULL,
 position integer NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 type text NOT NULL CHECK(type IN ('Text','Number','Date','Checkbox')),
 value text NOT NULL CHECK(length(value)<=2000),
 PRIMARY KEY(company_id,parent_id,position),
 FOREIGN KEY(company_id,parent_id) REFERENCES ledger_vendors(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_custom_field_names ON ledger_vendors_customfields(company_id,parent_id,lower(name));
COMMIT;
