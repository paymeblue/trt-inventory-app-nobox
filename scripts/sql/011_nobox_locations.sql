-- Nobox keeps stock in Lagos and Abuja. Each Nobox material is held in one of
-- them, so the same material in both cities is two rows with their own stock,
-- reservations and logs.
ALTER TABLE items ADD COLUMN IF NOT EXISTS location text;
UPDATE items SET location = 'LAGOS' WHERE source = 'NOBOX' AND location IS NULL;
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_location_check;
ALTER TABLE items ADD CONSTRAINT items_location_check CHECK (
  (source = 'NOBOX' AND location IN ('LAGOS','ABUJA')) OR (source <> 'NOBOX' AND location IS NULL));

-- The stock workbook reuses a Material_Code for every finish and size of a
-- handle or knob (YXJ-0042 in MATT GOLD 1 METRE, MATT GOLD 25CM, ROSE GOLD…),
-- so a code alone no longer identifies a material. Code, name, subcategory,
-- specification and dimensions together do.
DROP INDEX IF EXISTS items_source_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS items_identity_key ON items (
  source, COALESCE(location, ''), lower(sku), lower(name), lower(COALESCE(subcategory, '')),
  lower(COALESCE(spec, '')), lower(COALESCE(dimensions, '')));
CREATE INDEX IF NOT EXISTS items_source_sku_idx ON items (source, lower(sku));
