-- Group companies. TRT is the parent; Nobox and any future sister company sit
-- under it. Stock is owned by whoever owns the location it sits in, which is how
-- the "Materials Visibility and Usage" flow describes inter-company stock.

CREATE TABLE IF NOT EXISTS companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  short_name  text NOT NULL,
  parent_id   uuid REFERENCES companies(id) ON DELETE SET NULL,
  colour      text NOT NULL DEFAULT '#f0a52a',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS locations_company_idx ON locations(company_id);

-- Users can be scoped to one company; NULL means they see the whole group.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

-- Projects belong to whichever company is delivering them.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
