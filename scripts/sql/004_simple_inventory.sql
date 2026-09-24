-- Simplified inventory: one list of items, each owned by the Factory or by
-- Nobox, with a log of every quantity change. Replaces the catalogue, the
-- per-location stock, requisitions, receipts, projects and process flows.

CREATE TABLE IF NOT EXISTS items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text NOT NULL CHECK (source IN ('FACTORY','NOBOX')),
  sku            text NOT NULL,
  name           text NOT NULL,
  category       text,
  colour         text,
  spec           text,
  unit           text NOT NULL DEFAULT 'pcs',
  quantity       numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_level  numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  description    text,
  image_id       uuid REFERENCES images(id) ON DELETE SET NULL,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS items_source_sku_key ON items(source, lower(sku));
CREATE INDEX IF NOT EXISTS items_name_idx ON items(lower(name));
CREATE INDEX IF NOT EXISTS items_updated_idx ON items(updated_at DESC);

CREATE TABLE IF NOT EXISTS item_movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source         text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('CREATE','ADJUST','IMPORT')),
  delta          numeric(14,3) NOT NULL,
  balance_after  numeric(14,3) NOT NULL,
  note           text,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS item_movements_source_idx ON item_movements(source, created_at DESC);
CREATE INDEX IF NOT EXISTS item_movements_item_idx ON item_movements(item_id, created_at DESC);

-- Carry the old catalogue across. Stock at a Nobox-owned location becomes a
-- Nobox item; everything else, and any product with no stock anywhere, is Factory.
INSERT INTO items (source, sku, name, category, colour, spec, unit, quantity,
                   reorder_level, description, image_id, created_by, created_at, updated_at)
SELECT s.source, p.sku, p.name, c.name, p.colour, p.spec, p.unit,
       GREATEST(s.quantity, 0), p.reorder_level, p.description, p.image_id,
       p.created_by, p.created_at, now()
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  JOIN (
    SELECT sl.product_id,
           CASE WHEN co.code IN ('NBX','NOBOX') THEN 'NOBOX' ELSE 'FACTORY' END AS source,
           SUM(sl.on_hand) AS quantity
      FROM stock_levels sl
      JOIN locations l ON l.id = sl.location_id
      LEFT JOIN companies co ON co.id = l.company_id
     GROUP BY 1, 2
    UNION ALL
    SELECT p2.id, 'FACTORY', 0
      FROM products p2
     WHERE NOT EXISTS (SELECT 1 FROM stock_levels sl2 WHERE sl2.product_id = p2.id)
  ) s ON s.product_id = p.id
 WHERE p.is_active
ON CONFLICT DO NOTHING;

INSERT INTO item_movements (item_id, source, kind, delta, balance_after, note, created_by)
SELECT id, source, 'CREATE', quantity, quantity, 'Carried over from the previous system', created_by
  FROM items;

-- Four roles now. Anyone who could change stock becomes the manager for the
-- side they were scoped to; everyone else can look but not touch.
UPDATE users u SET role = CASE
    WHEN u.role = 'ADMIN' THEN 'ADMIN'
    WHEN u.role IN ('OPERATIONS_MANAGER','FACTORY_MANAGER','STOREKEEPER','INVENTORY_OFFICER')
      THEN CASE WHEN co.code IN ('NBX','NOBOX') THEN 'NOBOX_MANAGER' ELSE 'FACTORY_MANAGER' END
    ELSE 'DESIGNER'
  END
  FROM users u2
  LEFT JOIN companies co ON co.id = u2.company_id
 WHERE u2.id = u.id;

DROP TABLE IF EXISTS
  process_run_stages, process_runs, process_stages, process_flows,
  goods_receipt_items, goods_receipts,
  requisition_items, requisitions,
  stock_movements, stock_levels, import_batches, activity_log,
  products, categories, suppliers, projects
  CASCADE;

ALTER TABLE users DROP COLUMN IF EXISTS location_id;
ALTER TABLE users DROP COLUMN IF EXISTS company_id;

DROP TABLE IF EXISTS locations, companies CASCADE;

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'DESIGNER';
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN','FACTORY_MANAGER','NOBOX_MANAGER','DESIGNER'));
