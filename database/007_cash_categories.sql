BEGIN;
CREATE TABLE IF NOT EXISTS cash_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS cash_categories_global_name ON cash_categories(lower(trim(name))) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cash_categories_company_name ON cash_categories(company_id,lower(trim(name))) WHERE company_id IS NOT NULL;
INSERT INTO cash_categories(name,company_id)
SELECT DISTINCT trim(category),company_id FROM cash_transactions ON CONFLICT DO NOTHING;
DROP TRIGGER IF EXISTS audit_cash_categories ON cash_categories;
CREATE TRIGGER audit_cash_categories AFTER INSERT OR UPDATE OR DELETE ON cash_categories FOR EACH ROW EXECUTE FUNCTION record_system_audit();
COMMIT;
