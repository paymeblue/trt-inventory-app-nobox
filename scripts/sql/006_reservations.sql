-- Reservations: a designer sets stock aside for a project; the Factory or Nobox
-- issues it when the items are actually dispatched, and only then is it taken
-- out of stock. Every step is written to reservation_events, which is the log.

CREATE SEQUENCE IF NOT EXISTS reservation_ref_seq;

CREATE TABLE IF NOT EXISTS reservations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           text NOT NULL UNIQUE DEFAULT ('RES-' || lpad(nextval('reservation_ref_seq')::text, 5, '0')),
  item_id       uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source        text NOT NULL CHECK (source IN ('FACTORY','NOBOX')),
  quantity      numeric(14,3) NOT NULL CHECK (quantity > 0),
  project       text NOT NULL,
  notes         text,
  status        text NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','ISSUED','CANCELLED')),
  reserved_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_item_idx ON reservations(item_id) WHERE status = 'RESERVED';
CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations(status, created_at DESC);

CREATE TABLE IF NOT EXISTS reservation_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  action          text NOT NULL CHECK (action IN ('RESERVED','ISSUED','CANCELLED')),
  note            text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_events_created_idx ON reservation_events(created_at DESC);

-- Issuing a reservation is a stock movement of its own kind.
ALTER TABLE item_movements DROP CONSTRAINT IF EXISTS item_movements_kind_check;
ALTER TABLE item_movements ADD CONSTRAINT item_movements_kind_check
  CHECK (kind IN ('CREATE','ADJUST','IMPORT','ISSUE'));

-- The categories used in the TRT inventory workbook, on both sides.
INSERT INTO categories (source, name)
SELECT s.source, c.name
  FROM (VALUES ('FACTORY'), ('NOBOX')) AS s(source)
 CROSS JOIN (VALUES
   ('Boards'), ('Back Panel'), ('Edge Tapes (PVC)'), ('MFC PVC by 42'), ('Handles'),
   ('Runners'), ('Hangar Rod'), ('Closet Accessories'), ('Kitchen Accessories'),
   ('Glass Shelves'), ('Ladin Doors'), ('Profiles & Connectors'), ('Quartz and Porcelain'),
   ('Sinks'), ('Light Material'), ('Liquid and Gum'), ('Paint Materials'), ('Nails & Pins'),
   ('Sandpaper'), ('Bits'), ('Tools'), ('Other Accessories')
 ) AS c(name)
ON CONFLICT DO NOTHING;
