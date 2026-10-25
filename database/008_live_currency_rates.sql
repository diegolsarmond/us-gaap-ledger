-- Currency metadata and live quotes are derived at runtime, never persisted.
BEGIN;
UPDATE ledger_currencies
SET data = data - 'symbol' - 'exchangeRateToUsd' - 'quotationType' - 'lastUpdated';
COMMIT;
