-- Configurable company dimensions and normalized document/GL classifications.
BEGIN;
CREATE TABLE IF NOT EXISTS ledger_dimensions (
 company_id uuid NOT NULL REFERENCES companies(id), id text NOT NULL,
 position integer NOT NULL CHECK(position>=0), code text NOT NULL, name text NOT NULL,
 status text NOT NULL CHECK(status IN ('Active','Inactive')), required boolean NOT NULL,
 apply_invoices boolean NOT NULL, apply_bills boolean NOT NULL,
 PRIMARY KEY(company_id,id), UNIQUE(company_id,code)
);
CREATE TABLE IF NOT EXISTS ledger_dimensions_options (
 company_id uuid NOT NULL, parent_id text NOT NULL, position integer NOT NULL CHECK(position>=0),
 id text NOT NULL, code text NOT NULL, name text NOT NULL,
 status text NOT NULL CHECK(status IN ('Active','Inactive')),
 PRIMARY KEY(company_id,parent_id,position), UNIQUE(company_id,parent_id,id),
 UNIQUE(company_id,parent_id,code),
 FOREIGN KEY(company_id,parent_id) REFERENCES ledger_dimensions(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
DO $$ DECLARE domain text; BEGIN
 FOREACH domain IN ARRAY ARRAY['invoices','bills','journals'] LOOP
  EXECUTE format('CREATE TABLE IF NOT EXISTS ledger_%I_dimensionvalues (
   company_id uuid NOT NULL, parent_id text NOT NULL, position integer NOT NULL CHECK(position>=0),
   dimension_id text NOT NULL, value_id text NOT NULL, line_id text,
   PRIMARY KEY(company_id,parent_id,position),
   FOREIGN KEY(company_id,parent_id) REFERENCES ledger_%I(company_id,id) DEFERRABLE INITIALLY DEFERRED,
   FOREIGN KEY(company_id,dimension_id,value_id) REFERENCES ledger_dimensions_options(company_id,parent_id,id) DEFERRABLE INITIALLY DEFERRED
  )',domain,domain);
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON ledger_%I_dimensionvalues(company_id,parent_id,dimension_id,coalesce(line_id,''''))', domain||'_dimension_line_unique',domain);
 END LOOP;
END $$;
COMMIT;
