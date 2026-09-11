-- The TRT process flows themselves, and running instances of them.
--
-- The workbook describes 17 flows as stage tables (who acts, what documents,
-- who decides, what the criteria are, how long it takes). Rather than hard-code
-- 17 bespoke screens, the flows are data and a run is an instance of one, so
-- every flow in the workbook works on day one and editing the workbook is how
-- you change the process.

CREATE TABLE IF NOT EXISTS process_flows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  category      text NOT NULL,
  summary       text,
  source_sheet  text,
  app_route     text,          -- the screen that performs this work, when there is one
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS process_stages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         uuid NOT NULL REFERENCES process_flows(id) ON DELETE CASCADE,
  seq             integer NOT NULL,
  name            text NOT NULL,
  action_by       text,
  steps           text,
  documents       text,
  decision_maker  text,
  criteria        text,
  stakeholders    text,
  duration        text,
  UNIQUE (flow_id, seq)
);
CREATE INDEX IF NOT EXISTS process_stages_flow_idx ON process_stages(flow_id, seq);

CREATE TABLE IF NOT EXISTS process_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           text NOT NULL UNIQUE,
  flow_id       uuid NOT NULL REFERENCES process_flows(id) ON DELETE RESTRICT,
  title         text NOT NULL,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  company_id    uuid REFERENCES companies(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  notes         text,
  started_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS process_runs_status_idx ON process_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS process_runs_flow_idx ON process_runs(flow_id);

CREATE TABLE IF NOT EXISTS process_run_stages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES process_runs(id) ON DELETE CASCADE,
  stage_id      uuid NOT NULL REFERENCES process_stages(id) ON DELETE CASCADE,
  seq           integer NOT NULL,
  status        text NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','IN_PROGRESS','DONE','SKIPPED','BLOCKED')),
  assigned_to   uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at    timestamptz,
  completed_at  timestamptz,
  due_on        date,
  notes         text,
  UNIQUE (run_id, stage_id)
);
CREATE INDEX IF NOT EXISTS process_run_stages_run_idx ON process_run_stages(run_id, seq);
