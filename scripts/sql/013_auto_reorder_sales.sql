-- Reorder_Level and Reorder_Quantity are calculated from what each material
-- actually uses (see src/lib/reorder.ts). A manager can still set either by
-- hand; a value set by hand is kept until it is cleared again.
ALTER TABLE items ADD COLUMN IF NOT EXISTS reorder_level_manual boolean NOT NULL DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS reorder_quantity_manual boolean NOT NULL DEFAULT false;
-- Days from placing an order to the stock arriving; NULL uses the side's default.
ALTER TABLE items ADD COLUMN IF NOT EXISTS lead_time_days numeric(6,1) CHECK (lead_time_days > 0);

-- Anything already typed in was set by hand.
UPDATE items SET reorder_level_manual = true WHERE reorder_level > 0;
UPDATE items SET reorder_quantity_manual = true WHERE reorder_quantity > 0;

-- Each side's defaults for the calculation.
CREATE TABLE IF NOT EXISTS side_settings (
  source                 text PRIMARY KEY CHECK (source IN ('FACTORY','NOBOX','READY_CABINETS','GERMANA')),
  lead_time_days         numeric(6,1) NOT NULL DEFAULT 14 CHECK (lead_time_days > 0),
  cover_days             numeric(6,1) NOT NULL DEFAULT 30 CHECK (cover_days > 0),
  reorder_calculated_at  timestamptz,
  updated_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO side_settings (source)
VALUES ('FACTORY'), ('NOBOX'), ('READY_CABINETS'), ('GERMANA')
ON CONFLICT DO NOTHING;

-- Sales teams reserve stock the same way designers do. Every reservation says
-- which of the two the person responsible is in.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN','FACTORY_MANAGER','NOBOX_MANAGER','READY_CABINETS_MANAGER','GERMANA_MANAGER','DESIGNER','SALES'));

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reserved_for text CHECK (reserved_for IN ('DESIGN','SALES'));
UPDATE reservations SET reserved_for = 'DESIGN' WHERE reserved_for IS NULL;
