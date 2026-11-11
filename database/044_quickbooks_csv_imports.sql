BEGIN;

CREATE TABLE IF NOT EXISTS quickbooks_csv_imports (
  company_id uuid NOT NULL REFERENCES companies(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (btrim(source_type) <> ''),
  file_name text NOT NULL CHECK (btrim(file_name) <> ''),
  file_digest text NOT NULL CHECK (file_digest ~ '^[0-9a-f]{64}$'),
  file_content bytea NOT NULL CHECK (octet_length(file_content) > 0),
  column_headers text[] NOT NULL CHECK (cardinality(column_headers) > 0),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, source_type, file_digest)
);

CREATE TABLE IF NOT EXISTS quickbooks_csv_rows (
  company_id uuid NOT NULL,
  import_id uuid NOT NULL,
  row_number integer NOT NULL CHECK (row_number > 0),
  cells text[] NOT NULL,
  external_id text,
  PRIMARY KEY (company_id, import_id, row_number),
  FOREIGN KEY (company_id, import_id)
    REFERENCES quickbooks_csv_imports(company_id, id) ON DELETE CASCADE
);

COMMENT ON COLUMN quickbooks_csv_imports.column_headers IS
  'Column labels in file order. Preserve blank and repeated labels.';
COMMENT ON COLUMN quickbooks_csv_rows.cells IS
  'Parsed cells in column order. Keep IDs and monetary values as source text until mapping.';
COMMENT ON COLUMN quickbooks_csv_rows.external_id IS
  'Optional source ID populated only when the CSV layout exposes a known ID column.';

COMMIT;
