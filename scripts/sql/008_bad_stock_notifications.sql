-- Bad stock: damaged or faulty units the factory sets aside with a reason. They
-- leave usable stock (so they cannot be reserved or issued) but are kept on
-- record until restored or written off.
ALTER TABLE items ADD COLUMN IF NOT EXISTS bad_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (bad_qty >= 0);

ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS bad_impact numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_adjustment_type_check CHECK (adjustment_type IN (
  'Return to Stock','Additional Issue','Reservation Release','Damage / Write-off','Count Gain','Count Loss',
  'Move to Bad Stock','Restore from Bad Stock'));

-- When each person last opened their notifications; everything newer is unread.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_seen_at timestamptz NOT NULL DEFAULT now();
