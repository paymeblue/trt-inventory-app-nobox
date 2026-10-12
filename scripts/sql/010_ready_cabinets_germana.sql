-- Ready Cabinets and Germana hold their own stock, like the Factory and Nobox,
-- each with its own manager.
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_source_check;
ALTER TABLE items ADD CONSTRAINT items_source_check
  CHECK (source IN ('FACTORY','NOBOX','READY_CABINETS','GERMANA'));
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_source_check;
ALTER TABLE categories ADD CONSTRAINT categories_source_check
  CHECK (source IN ('FACTORY','NOBOX','READY_CABINETS','GERMANA'));
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_source_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_source_check
  CHECK (source IN ('FACTORY','NOBOX','READY_CABINETS','GERMANA'));
ALTER TABLE stock_issues DROP CONSTRAINT IF EXISTS stock_issues_source_check;
ALTER TABLE stock_issues ADD CONSTRAINT stock_issues_source_check
  CHECK (source IN ('FACTORY','NOBOX','READY_CABINETS','GERMANA'));
ALTER TABLE stock_additions DROP CONSTRAINT IF EXISTS stock_additions_source_check;
ALTER TABLE stock_additions ADD CONSTRAINT stock_additions_source_check
  CHECK (source IN ('FACTORY','NOBOX','READY_CABINETS','GERMANA'));
ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_source_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_source_check
  CHECK (source IN ('FACTORY','NOBOX','READY_CABINETS','GERMANA'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN','FACTORY_MANAGER','NOBOX_MANAGER','READY_CABINETS_MANAGER','GERMANA_MANAGER','DESIGNER'));

-- Start the new sides with the same categories as Nobox.
INSERT INTO categories (source, name)
SELECT s.source, c.name
  FROM (VALUES ('READY_CABINETS'), ('GERMANA')) AS s(source)
 CROSS JOIN (SELECT name FROM categories WHERE source = 'NOBOX') AS c
ON CONFLICT DO NOTHING;
