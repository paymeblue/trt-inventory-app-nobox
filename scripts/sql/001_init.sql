-- TRT / Nobox Inventory Control System
-- Derived from the TRT process flows (Store, Procurement, Material Reception,
-- Materials Visibility & Usage, Project Supervision, Logistics, QC).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- reference

CREATE TABLE IF NOT EXISTS locations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  name         text NOT NULL,
  kind         text NOT NULL DEFAULT 'WAREHOUSE'
               CHECK (kind IN ('WAREHOUSE','FACTORY','SITE','TRANSIT')),
  address      text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  full_name      text NOT NULL,
  role           text NOT NULL DEFAULT 'VIEWER',
  phone          text,
  location_id    uuid REFERENCES locations(id) ON DELETE SET NULL,
  is_active      boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  contact_person text,
  email          text,
  phone          text,
  address        text,
  is_approved    boolean NOT NULL DEFAULT false,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_key ON suppliers(lower(name));

CREATE TABLE IF NOT EXISTS projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  client_name   text,
  site_address  text,
  status        text NOT NULL DEFAULT 'PLANNING'
                CHECK (status IN ('PLANNING','IN_PRODUCTION','INSTALLATION','COMPLETED','ON_HOLD','CANCELLED')),
  supervisor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  start_date    date,
  target_date   date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ images
-- Images live in Postgres so the app is self-contained (no external bucket).

CREATE TABLE IF NOT EXISTS images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     text NOT NULL,
  mime_type    text NOT NULL,
  byte_size    integer NOT NULL,
  data         bytea NOT NULL,
  uploaded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- products

CREATE TABLE IF NOT EXISTS products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku            text NOT NULL,
  name           text NOT NULL,
  description    text,
  category_id    uuid REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id    uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  unit           text NOT NULL DEFAULT 'pcs',
  unit_cost      numeric(14,2) NOT NULL DEFAULT 0,
  reorder_level  numeric(14,3) NOT NULL DEFAULT 0,
  image_id       uuid REFERENCES images(id) ON DELETE SET NULL,
  colour         text,
  spec           text,
  shelf_ref      text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key ON products(lower(sku));
CREATE INDEX IF NOT EXISTS products_name_idx ON products(lower(name));
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);

-- Per-location balances. on_hand and reserved are maintained by the app in a
-- transaction alongside every stock_movements insert.
CREATE TABLE IF NOT EXISTS stock_levels (
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id  uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  on_hand      numeric(14,3) NOT NULL DEFAULT 0,
  reserved     numeric(14,3) NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, location_id)
);
CREATE INDEX IF NOT EXISTS stock_levels_location_idx ON stock_levels(location_id);

-- Immutable ledger of every physical movement.
CREATE TABLE IF NOT EXISTS stock_movements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type     text NOT NULL
                    CHECK (movement_type IN ('RECEIPT','ISSUE','RETURN','TRANSFER','ADJUSTMENT','WASTE','OPENING')),
  quantity          numeric(14,3) NOT NULL,
  from_location_id  uuid REFERENCES locations(id) ON DELETE SET NULL,
  to_location_id    uuid REFERENCES locations(id) ON DELETE SET NULL,
  unit_cost         numeric(14,2),
  reference         text,
  requisition_id    uuid,
  receipt_id        uuid,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  notes             text,
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements(created_at DESC);

-- ------------------------------------------------------------ requisitions
-- Covers the MRF -> approval -> MIV -> issue -> site receipt -> return cycle.

CREATE TABLE IF NOT EXISTS requisitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref               text NOT NULL UNIQUE,
  title             text NOT NULL,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  from_location_id  uuid NOT NULL REFERENCES locations(id),
  to_location_id    uuid REFERENCES locations(id),
  status            text NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','ISSUED','RECEIVED','CLOSED','CANCELLED')),
  priority          text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  needed_by         date,
  notes             text,
  requested_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  rejected_reason   text,
  issued_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  issued_at         timestamptz,
  received_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  received_at       timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS requisitions_status_idx ON requisitions(status);

CREATE TABLE IF NOT EXISTS requisition_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id   uuid NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty_requested    numeric(14,3) NOT NULL CHECK (qty_requested > 0),
  qty_approved     numeric(14,3),
  qty_issued       numeric(14,3) NOT NULL DEFAULT 0,
  qty_returned     numeric(14,3) NOT NULL DEFAULT 0,
  qty_used         numeric(14,3) NOT NULL DEFAULT 0,
  notes            text
);
CREATE INDEX IF NOT EXISTS requisition_items_req_idx ON requisition_items(requisition_id);

-- ---------------------------------------------------------------- receipts
-- Goods Received Notes: supplier delivery -> verification -> shelving.

CREATE TABLE IF NOT EXISTS goods_receipts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           text NOT NULL UNIQUE,
  supplier_id   uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  location_id   uuid NOT NULL REFERENCES locations(id),
  waybill_no    text,
  lpo_no        text,
  status        text NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
  received_at   timestamptz NOT NULL DEFAULT now(),
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  posted_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  posted_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id    uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty_expected  numeric(14,3),
  qty_received  numeric(14,3) NOT NULL CHECK (qty_received > 0),
  unit_cost     numeric(14,2) NOT NULL DEFAULT 0,
  condition     text NOT NULL DEFAULT 'GOOD' CHECK (condition IN ('GOOD','DAMAGED','SHORT','WRONG_SPEC')),
  notes         text
);
CREATE INDEX IF NOT EXISTS goods_receipt_items_rcpt_idx ON goods_receipt_items(receipt_id);

-- ------------------------------------------------------------- activity log

CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log(created_at DESC);

-- --------------------------------------------------------------- imports

CREATE TABLE IF NOT EXISTS import_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       text NOT NULL,
  rows_total     integer NOT NULL DEFAULT 0,
  rows_created   integer NOT NULL DEFAULT 0,
  rows_updated   integer NOT NULL DEFAULT 0,
  rows_skipped   integer NOT NULL DEFAULT 0,
  location_id    uuid REFERENCES locations(id) ON DELETE SET NULL,
  errors         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
