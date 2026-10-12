-- A category can be archived: its items stay on record but are hidden from the
-- inventory, the dashboards and their counts until the category is made
-- active again. Adding stock to an item re-activates its category.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Start with only the categories that hold available stock showing: archive
-- every category whose items are all out of stock.
UPDATE categories c SET is_active = false, updated_at = now()
 WHERE EXISTS (SELECT 1 FROM items i WHERE i.source = c.source AND i.category = c.name)
   AND NOT EXISTS (SELECT 1 FROM items i WHERE i.source = c.source AND i.category = c.name AND i.quantity > 0);
