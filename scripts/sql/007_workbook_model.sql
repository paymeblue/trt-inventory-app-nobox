-- The model of the TRT "Inventory Reservation and Stock Monitoring" workbook:
-- Inventory_Master plus its four logs (Reservation, Stock Issue, Stock Addition,
-- Stock Adjustment). Every quantity on an item is explained by these logs.

-- Inventory_Master columns the app did not have yet.
ALTER TABLE items ADD COLUMN IF NOT EXISTS subcategory text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS dimensions text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS opening_qty numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS reorder_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_quantity >= 0);

-- Opening stock for items that already exist is what they held before any log.
UPDATE items i SET opening_qty = COALESCE((
  SELECT m.delta FROM item_movements m
   WHERE m.item_id = i.id AND m.kind IN ('CREATE','IMPORT')
   ORDER BY m.created_at LIMIT 1), 0);

ALTER TABLE item_movements DROP CONSTRAINT IF EXISTS item_movements_kind_check;
ALTER TABLE item_movements ADD CONSTRAINT item_movements_kind_check
  CHECK (kind IN ('CREATE','ADJUST','IMPORT','ISSUE','ADDITION','OPENING'));

-- Reservation_Log. A reservation can be issued in several parts (the Stock Issue
-- form issues "Quantity To Issue" against its balance) and part of it can be
-- released by a Reservation Release adjustment.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_quantity_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_quantity_check CHECK (quantity >= 0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS issued_qty numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS released_qty numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS designer_name text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS designer_email text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS available_at_request numeric(14,3);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS legacy_status text;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('RESERVED','PART_ISSUED','ISSUED','CANCELLED'));
ALTER TABLE reservations ALTER COLUMN ref SET DEFAULT ('REQ-' || lpad(nextval('reservation_ref_seq')::text, 5, '0'));

UPDATE reservations r SET
  issued_qty = CASE WHEN r.status = 'ISSUED' THEN r.quantity ELSE 0 END,
  designer_name = COALESCE(r.designer_name, u.full_name),
  designer_email = COALESCE(r.designer_email, u.email)
  FROM users u WHERE u.id = r.reserved_by;

ALTER TABLE reservation_events ADD COLUMN IF NOT EXISTS quantity numeric(14,3);
ALTER TABLE reservation_events DROP CONSTRAINT IF EXISTS reservation_events_action_check;
ALTER TABLE reservation_events ADD CONSTRAINT reservation_events_action_check
  CHECK (action IN ('RESERVED','ISSUED','CANCELLED','RELEASED'));

-- Stock_Issue_Log
CREATE SEQUENCE IF NOT EXISTS stock_issue_ref_seq;
CREATE TABLE IF NOT EXISTS stock_issues (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref              text NOT NULL UNIQUE DEFAULT ('ISS-' || lpad(nextval('stock_issue_ref_seq')::text, 5, '0')),
  reservation_id   uuid REFERENCES reservations(id) ON DELETE SET NULL,
  -- The reservation as the workbook named it, kept when it cannot be linked.
  reservation_ref  text,
  item_id          uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source           text NOT NULL CHECK (source IN ('FACTORY','NOBOX')),
  quantity         numeric(14,3) NOT NULL CHECK (quantity > 0),
  project          text,
  notes            text,
  issued_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  issued_by_name   text,
  issued_by_email  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_issues_created_idx ON stock_issues(created_at DESC);
CREATE INDEX IF NOT EXISTS stock_issues_reservation_idx ON stock_issues(reservation_id);

-- Stock_Addition_Log
CREATE SEQUENCE IF NOT EXISTS stock_addition_ref_seq;
CREATE TABLE IF NOT EXISTS stock_additions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                text NOT NULL UNIQUE DEFAULT ('ADD-' || lpad(nextval('stock_addition_ref_seq')::text, 5, '0')),
  item_id            uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source             text NOT NULL CHECK (source IN ('FACTORY','NOBOX')),
  quantity           numeric(14,3) NOT NULL CHECK (quantity > 0),
  supplier_ref       text,
  document_ref       text,
  notes              text,
  recorded_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_by_name   text,
  recorded_by_email  text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_additions_created_idx ON stock_additions(created_at DESC);

-- Stock_Adjustment_Log. The signed impacts are exactly the workbook's formulas.
CREATE SEQUENCE IF NOT EXISTS stock_adjustment_ref_seq;
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref              text NOT NULL UNIQUE DEFAULT ('ADJ-' || lpad(nextval('stock_adjustment_ref_seq')::text, 5, '0')),
  item_id          uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source           text NOT NULL CHECK (source IN ('FACTORY','NOBOX')),
  adjustment_type  text NOT NULL CHECK (adjustment_type IN (
                     'Return to Stock','Additional Issue','Reservation Release',
                     'Damage / Write-off','Count Gain','Count Loss')),
  quantity         numeric(14,3) NOT NULL CHECK (quantity > 0),
  stock_impact     numeric(14,3) NOT NULL,
  reserved_impact  numeric(14,3) NOT NULL,
  issued_impact    numeric(14,3) NOT NULL,
  related_ref      text,
  reservation_id   uuid REFERENCES reservations(id) ON DELETE SET NULL,
  notes            text,
  adjusted_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  adjusted_by_name text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_adjustments_created_idx ON stock_adjustments(created_at DESC);

-- Issues already made through the app become Stock_Issue_Log rows.
INSERT INTO stock_issues (reservation_id, reservation_ref, item_id, source, quantity, project, issued_by, issued_by_name, created_at)
SELECT r.id, r.ref, r.item_id, r.source, r.quantity, r.project, r.closed_by, u.full_name, COALESCE(r.closed_at, r.updated_at)
  FROM reservations r LEFT JOIN users u ON u.id = r.closed_by
 WHERE r.status = 'ISSUED' AND r.quantity > 0;

-- Additions already made through the app become Stock_Addition_Log rows.
INSERT INTO stock_additions (item_id, source, quantity, notes, recorded_by, recorded_by_name, created_at)
SELECT m.item_id, m.source, m.delta, m.note, m.created_by, u.full_name, m.created_at
  FROM item_movements m LEFT JOIN users u ON u.id = m.created_by
 WHERE m.kind = 'ADJUST' AND m.delta > 0;
