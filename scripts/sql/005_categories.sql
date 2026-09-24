-- Categories are managed per side, so a manager can create one before any item
-- uses it and rename it everywhere at once. items.category keeps the name, and
-- the app writes the category's exact spelling so the two always match.

CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL CHECK (source IN ('FACTORY','NOBOX')),
  name        text NOT NULL,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_source_name_key ON categories(source, lower(name));

INSERT INTO categories (source, name)
SELECT DISTINCT ON (source, lower(category)) source, category
  FROM items
 WHERE category IS NOT NULL AND btrim(category) <> ''
 ORDER BY source, lower(category), category
ON CONFLICT DO NOTHING;

-- Line up any differently-cased spellings with the one that was kept.
UPDATE items i SET category = c.name
  FROM categories c
 WHERE c.source = i.source AND lower(c.name) = lower(i.category) AND c.name <> i.category;
