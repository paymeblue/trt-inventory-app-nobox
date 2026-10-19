-- The company a Designer or Sales person works for (Factory, Nobox, Ready
-- Cabinets or Germana). Managers belong to the company their role names, and
-- administrators to the whole group, so theirs stays empty.
ALTER TABLE users ADD COLUMN IF NOT EXISTS company text
  CHECK (company IN ('FACTORY','NOBOX','READY_CABINETS','GERMANA'));
