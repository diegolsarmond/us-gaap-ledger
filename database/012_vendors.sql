BEGIN;
CREATE TABLE IF NOT EXISTS ledger_vendors (
  company_id uuid NOT NULL REFERENCES companies(id),
  id text NOT NULL,
  position integer NOT NULL,
  data jsonb NOT NULL CHECK (length(btrim(data->>'displayName')) > 0),
  PRIMARY KEY(company_id,id)
);
CREATE TABLE IF NOT EXISTS vendor_attachments (
  company_id uuid NOT NULL,
  vendor_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 20971520),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,id),
  FOREIGN KEY(company_id,vendor_id) REFERENCES ledger_vendors(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS vendor_attachments_vendor_idx ON vendor_attachments(company_id,vendor_id);
COMMIT;
