BEGIN;

CREATE TABLE IF NOT EXISTS quickbooks_import_objects (
  company_id uuid NOT NULL REFERENCES companies(id),
  realm_id text NOT NULL CHECK (realm_id <> ''),
  object_type text NOT NULL,
  external_id text NOT NULL,
  sync_token text,
  source_updated_at timestamptz,
  digest text NOT NULL,
  payload text NOT NULL CHECK (jsonb_typeof(payload::jsonb) = 'object'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, realm_id, object_type, external_id, digest)
);

COMMIT;
