-- Backfill currency on existing expenses that defaulted to 'USD'
-- Change 'AED' below to match whatever currency your existing data was in.
UPDATE expenses
SET currency = 'AED'
WHERE currency = 'USD'
  AND created_at < now();
