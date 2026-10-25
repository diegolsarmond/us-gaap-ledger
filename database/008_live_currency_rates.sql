-- Currency metadata and live quotes are derived at runtime, never persisted.
BEGIN;
CREATE OR REPLACE FUNCTION strip_live_currency_fields() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.data := NEW.data - 'symbol' - 'exchangeRateToUsd' - 'quotationType' - 'lastUpdated';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS strip_live_currency_fields ON ledger_currencies;
CREATE TRIGGER strip_live_currency_fields BEFORE INSERT OR UPDATE ON ledger_currencies
FOR EACH ROW EXECUTE FUNCTION strip_live_currency_fields();
UPDATE ledger_currencies
SET data = data - 'symbol' - 'exchangeRateToUsd' - 'quotationType' - 'lastUpdated'
WHERE data ?| ARRAY['symbol','exchangeRateToUsd','quotationType','lastUpdated'];
UPDATE companies SET revision = revision + 1;
COMMIT;
