BEGIN;

CREATE TABLE IF NOT EXISTS quickbooks_purchases (
  company_id uuid NOT NULL,
  realm_id text NOT NULL,
  object_type text NOT NULL,
  external_id text NOT NULL,
  digest text NOT NULL,
  txn_date date,
  payment_type text,
  doc_number text,
  total_amt numeric,
  currency_id text,
  currency_name text,
  account_id text,
  account_name text,
  entity_id text,
  entity_name text,
  entity_type text,
  sync_token text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  response_time timestamptz,
  attributes jsonb,
  PRIMARY KEY (company_id, realm_id, object_type, external_id, digest),
  FOREIGN KEY (company_id, realm_id, object_type, external_id, digest) REFERENCES quickbooks_import_objects (company_id, realm_id, object_type, external_id, digest) ON DELETE CASCADE,
  CHECK (object_type = 'Purchase')
);

CREATE TABLE IF NOT EXISTS quickbooks_purchase_lines (
  company_id uuid NOT NULL,
  realm_id text NOT NULL,
  object_type text NOT NULL,
  external_id text NOT NULL,
  digest text NOT NULL,
  position bigint,
  line_id text,
  line_num integer,
  description text,
  amount numeric,
  detail_type text,
  account_id text,
  item_id text,
  qty numeric,
  unit_price numeric,
  attributes jsonb,
  PRIMARY KEY (company_id, realm_id, object_type, external_id, digest, position),
  FOREIGN KEY (company_id, realm_id, object_type, external_id, digest) REFERENCES quickbooks_purchases (company_id, realm_id, object_type, external_id, digest) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quickbooks_general_ledger_reports (
  company_id uuid NOT NULL,
  realm_id text NOT NULL,
  object_type text NOT NULL,
  external_id text NOT NULL,
  digest text NOT NULL,
  report_name text,
  report_time timestamptz,
  start_period date,
  end_period date,
  currency text,
  report_basis text,
  options jsonb,
  attributes jsonb,
  PRIMARY KEY (company_id, realm_id, object_type, external_id, digest),
  FOREIGN KEY (company_id, realm_id, object_type, external_id, digest) REFERENCES quickbooks_import_objects (company_id, realm_id, object_type, external_id, digest) ON DELETE CASCADE,
  CHECK (object_type = 'GeneralLedger')
);

CREATE TABLE IF NOT EXISTS quickbooks_general_ledger_columns (
  company_id uuid NOT NULL,
  realm_id text NOT NULL,
  object_type text NOT NULL,
  external_id text NOT NULL,
  digest text NOT NULL,
  position bigint,
  title text,
  column_type text,
  attributes jsonb,
  PRIMARY KEY (company_id, realm_id, object_type, external_id, digest, position),
  FOREIGN KEY (company_id, realm_id, object_type, external_id, digest) REFERENCES quickbooks_general_ledger_reports (company_id, realm_id, object_type, external_id, digest) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quickbooks_general_ledger_rows (
  company_id uuid NOT NULL,
  realm_id text NOT NULL,
  object_type text NOT NULL,
  external_id text NOT NULL,
  digest text NOT NULL,
  row_path bigint[],
  parent_path bigint[],
  row_type text,
  group_name text,
  attributes jsonb,
  PRIMARY KEY (company_id, realm_id, object_type, external_id, digest, row_path),
  FOREIGN KEY (company_id, realm_id, object_type, external_id, digest) REFERENCES quickbooks_general_ledger_reports (company_id, realm_id, object_type, external_id, digest) ON DELETE CASCADE,
  FOREIGN KEY (company_id, realm_id, object_type, external_id, digest, parent_path) REFERENCES quickbooks_general_ledger_rows (company_id, realm_id, object_type, external_id, digest, row_path) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quickbooks_general_ledger_cells (
  company_id uuid NOT NULL,
  realm_id text NOT NULL,
  object_type text NOT NULL,
  external_id text NOT NULL,
  digest text NOT NULL,
  row_path bigint[],
  cell_kind text,
  position bigint,
  value text,
  reference_id text,
  attributes jsonb,
  PRIMARY KEY (company_id, realm_id, object_type, external_id, digest, row_path, cell_kind, position),
  FOREIGN KEY (company_id, realm_id, object_type, external_id, digest) REFERENCES quickbooks_general_ledger_reports (company_id, realm_id, object_type, external_id, digest) ON DELETE CASCADE,
  FOREIGN KEY (company_id, realm_id, object_type, external_id, digest, row_path) REFERENCES quickbooks_general_ledger_rows (company_id, realm_id, object_type, external_id, digest, row_path) ON DELETE CASCADE,
  CHECK (cell_kind IN ('header', 'detail', 'summary'))
);

CREATE OR REPLACE FUNCTION project_quickbooks_import(source quickbooks_import_objects)
RETURNS void
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  document jsonb := source.payload::jsonb;
  body jsonb := document -> 'Purchase';
  header jsonb := document -> 'Header';
BEGIN
  IF source.object_type = 'Purchase' THEN
    INSERT INTO quickbooks_purchases (
      company_id, realm_id, object_type, external_id, digest, txn_date, payment_type, doc_number, total_amt, currency_id, currency_name, account_id, account_name, entity_id, entity_name, entity_type, sync_token, source_created_at, source_updated_at, response_time, attributes
    )
    SELECT source.company_id, source.realm_id, source.object_type, source.external_id, source.digest,
      NULLIF(body #>> '{TxnDate}', '')::date,
      body #>> '{PaymentType}',
      body #>> '{DocNumber}',
      NULLIF(body #>> '{TotalAmt}', '')::numeric,
      body #>> '{CurrencyRef,value}',
      body #>> '{CurrencyRef,name}',
      body #>> '{AccountRef,value}',
      body #>> '{AccountRef,name}',
      body #>> '{EntityRef,value}',
      body #>> '{EntityRef,name}',
      body #>> '{EntityRef,type}',
      body #>> '{SyncToken}',
      NULLIF(body #>> '{MetaData,CreateTime}', '')::timestamptz,
      NULLIF(body #>> '{MetaData,LastUpdatedTime}', '')::timestamptz,
      NULLIF(document #>> '{time}', '')::timestamptz,
      body
    ON CONFLICT DO NOTHING;
    
    INSERT INTO quickbooks_purchase_lines (
      company_id, realm_id, object_type, external_id, digest, position, line_id, line_num, description, amount, detail_type, account_id, item_id, qty, unit_price, attributes
    )
    SELECT source.company_id, source.realm_id, source.object_type, source.external_id, source.digest,
      position,
      line #>> '{Id}',
      NULLIF(line #>> '{LineNum}', '')::integer,
      line #>> '{Description}',
      NULLIF(line #>> '{Amount}', '')::numeric,
      line #>> '{DetailType}',
      detail #>> '{AccountRef,value}',
      detail #>> '{ItemRef,value}',
      NULLIF(detail #>> '{Qty}', '')::numeric,
      NULLIF(detail #>> '{UnitPrice}', '')::numeric,
      line
    FROM jsonb_array_elements(COALESCE(NULLIF(body -> 'Line', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY AS entry(line, position)
    CROSS JOIN LATERAL (SELECT line -> (line ->> 'DetailType') AS detail) AS expense
    ON CONFLICT DO NOTHING;
  ELSIF source.object_type = 'GeneralLedger' THEN
    INSERT INTO quickbooks_general_ledger_reports (
      company_id, realm_id, object_type, external_id, digest, report_name, report_time, start_period, end_period, currency, report_basis, options, attributes
    )
    SELECT source.company_id, source.realm_id, source.object_type, source.external_id, source.digest,
      header #>> '{ReportName}',
      NULLIF(header #>> '{Time}', '')::timestamptz,
      NULLIF(header #>> '{StartPeriod}', '')::date,
      NULLIF(header #>> '{EndPeriod}', '')::date,
      header #>> '{Currency}',
      header #>> '{ReportBasis}',
      header #> '{Option}',
      header
    ON CONFLICT DO NOTHING;
    
    INSERT INTO quickbooks_general_ledger_columns (
      company_id, realm_id, object_type, external_id, digest, position, title, column_type, attributes
    )
    SELECT source.company_id, source.realm_id, source.object_type, source.external_id, source.digest,
      position,
      definition ->> 'ColTitle',
      definition ->> 'ColType',
      definition
    FROM jsonb_array_elements(COALESCE(NULLIF(document #> '{Columns,Column}', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY AS entry(definition, position)
    ON CONFLICT DO NOTHING;
    
    WITH RECURSIVE report_rows(row_path, parent_path, row_data) AS (
      SELECT ARRAY[position], NULL::bigint[], row_data
      FROM jsonb_array_elements(COALESCE(NULLIF(document #> '{Rows,Row}', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY AS entry(row_data, position)
      UNION ALL
      SELECT parent.row_path || child.position, parent.row_path, child.row_data
      FROM report_rows AS parent
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(parent.row_data #> '{Rows,Row}', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY AS child(row_data, position)
    )
    INSERT INTO quickbooks_general_ledger_rows (
      company_id, realm_id, object_type, external_id, digest, row_path, parent_path, row_type, group_name, attributes
    )
    SELECT source.company_id, source.realm_id, source.object_type, source.external_id, source.digest,
      row_path,
      parent_path,
      row_data ->> 'type',
      row_data ->> 'group',
      row_data - 'Rows'
    FROM report_rows
    ON CONFLICT DO NOTHING;
    
    INSERT INTO quickbooks_general_ledger_cells (
      company_id, realm_id, object_type, external_id, digest, row_path, cell_kind, position, value, reference_id, attributes
    )
    SELECT source.company_id, source.realm_id, source.object_type, source.external_id, source.digest,
      row_path,
      cell_kind,
      position,
      cell ->> 'value',
      cell ->> 'id',
      cell
    FROM quickbooks_general_ledger_rows AS report_row
    CROSS JOIN LATERAL (VALUES
      ('header', report_row.attributes #> '{Header,ColData}'),
      ('detail', report_row.attributes -> 'ColData'),
      ('summary', report_row.attributes #> '{Summary,ColData}')
    ) AS section(cell_kind, cells)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(section.cells, 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY AS entry(cell, position)
    WHERE (report_row.company_id, report_row.realm_id, report_row.object_type, report_row.external_id, report_row.digest) =
          (source.company_id, source.realm_id, source.object_type, source.external_id, source.digest)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION project_quickbooks_import_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  PERFORM project_quickbooks_import(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_quickbooks_import ON quickbooks_import_objects;
CREATE TRIGGER project_quickbooks_import
AFTER INSERT ON quickbooks_import_objects
FOR EACH ROW
WHEN (NEW.object_type IN ('Purchase', 'GeneralLedger'))
EXECUTE FUNCTION project_quickbooks_import_after_insert();

SELECT project_quickbooks_import(source)
FROM quickbooks_import_objects AS source
WHERE object_type IN ('Purchase', 'GeneralLedger');

COMMIT;
