# TRT Nobox — Inventory Control

Material visibility, stock control and requisition tracking across the TRT
warehouse, factory floors and project sites. Built from the TRT process flows
(Store, Procurement, Material Reception, Materials Visibility & Usage, Project
Supervision, Logistics and QC).

## What it does

| Area | Covers |
|---|---|
| **App Flow** | All 17 process flows from the workbook as data — 158 stages. Each has a swimlane flow chart and the full stage table (action by, steps, documents, decision maker, criteria, duration). Start a run of any flow and work its stages as a live checklist with assignees, due dates, notes and an audit trail. |
| **Companies** | TRT with Nobox under it. Stock is owned by whoever owns the location it sits in, so the switcher in the top bar scopes the dashboard, catalogue, stock, alerts and ledger to one company — or shows the whole group. |
| **Catalogue** | Every board, edge tape, accessory and consumable — photo, spec, colour, shelf reference, unit cost, reorder level. Grid or table view, searchable and filterable. Photos upload by drag-and-drop and are stored in Postgres. |
| **Excel import** | Upload an existing stock sheet (.xlsx / .xls / .csv). Header rows are found even under a merged title, columns are auto-mapped, and opening quantities post into a store you choose as auditable movements. |
| **Stock levels** | Live balance per material per location, with a location matrix on desktop and a card list on phones. |
| **Movement ledger** | Immutable log of every receipt, issue, transfer, return, adjustment, waste and opening balance — who, when, which document, which project. CSV export. |
| **Requisitions (MIV)** | Draft → submitted → approved → issued → received → closed, with per-line approved quantities, partial returns and issue-vs-usage variance. |
| **Goods receipts (GRN)** | Supplier deliveries verified against expected quantity and condition before posting. Damaged and wrong-spec lines are recorded but never added to stock. |
| **Projects** | Materials issued and returned per job, with consumption percentage. |
| **Alerts** | Everything at or below its reorder level, worst cover first, with supplier contact and cost to restock. |
| **Reports** | Consumption, slow-moving/ageing stock, materials by project, movement mix and the audit trail. |
| **Team** | Ten roles mapped onto the process flows, enforced on the server as well as in the UI. |

Quantities, not currency: every figure is units of stock. Unit cost is still
captured on a material and on a goods receipt, but nothing is totalled in naira.

Light and dark themes, and laid out for phone, tablet and desktop.

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL and JWT_SECRET
npm run db:migrate             # create the schema
npm run db:seed                # optional: demo data + accounts
npm run dev
```

Open http://localhost:3000.

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (`?sslmode=require`). |
| `JWT_SECRET` | Signing key for the session cookie. Generate with `openssl rand -hex 32`. |

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Apply everything in `scripts/sql/`, tracked in `_migrations` |
| `npm run db:seed` | Demo locations, users, materials, projects and movements |
| `npm run db:reset` | **Drops the public schema.** Follow with `db:migrate` |
| `npm run db:user -- <email> <password> "<name>" [ROLE] [LOCATION]` | Create or update one account. Bootstraps the first administrator on a fresh database, and resets a password when nobody can sign in to do it in the UI. |
| `npm run db:flows` | Load the process flows from `scripts/flow-data.ts`. Safe to re-run; runs in progress are untouched. |
| `npm run db:images` | Render a material photo for any seeded material that has none. Run automatically by `db:seed`. |

## Accounts

### Test account

Full administrator access, created outside the seed so it survives a re-seed.

| Email | Password |
|---|---|
| `test@trtnobox.com` | `TrtTest2026!` |

### Sample spreadsheet

`samples/TRT Stock Count - sample.xlsx` is a realistic warehouse count sheet for
trying the importer: two title rows above the headers, a blank row in the middle,
four materials that already exist (they update) and thirteen that do not (they are
created). All ten columns map automatically.

## Demo accounts

Seeded by `npm run db:seed`, one per role. Password for all of them: **`trtnobox2026`**.

| Email | Role | Can do |
|---|---|---|
| `admin@trtnobox.com` | Administrator | Everything, including accounts |
| `ops@trtnobox.com` | Operations Manager | Everything except managing accounts |
| `factory@trtnobox.com` | Factory Manager | Approve requisitions, authorise issues |
| `store@trtnobox.com` | Storekeeper | Receive, shelve, issue, transfer, import |
| `inventory@trtnobox.com` | Inventory Officer | Verify deliveries, maintain records |
| `procurement@trtnobox.com` | Procurement Officer | Suppliers, requisitions, receipts |
| `site@trtnobox.com` | Project Supervisor | Raise requisitions, confirm site receipt |
| `qc@trtnobox.com` | Quality Control | Read-only across stock and deliveries |
| `logistics@trtnobox.com` | Logistics Officer | Read-only across stock and projects |
| `design@trtnobox.com` | Viewer | Catalogue and stock levels only |
| `nobox.store@trtnobox.com` | Storekeeper · Nobox | Nobox store only |
| `nobox.ops@trtnobox.com` | Operations Manager · Nobox | Nobox operations |

Change all of these before the system is used for real work — with
`npm run db:user`, or from the Team page as an administrator.

## How it is built

- **Next.js 16** (App Router) and **React 19**, TypeScript throughout.
- **Tailwind CSS v4** with a token-based theme in `src/app/globals.css`.
- **Postgres** through `pg` — plain SQL, no ORM. Schema in `scripts/sql/`.
- **JWT auth**: `jose`-signed token in an httpOnly cookie, `bcryptjs` password
  hashes. `middleware.ts` gates routes on cookie presence; every API route
  verifies the signature and the caller's permission.
- **Images** are stored as `bytea` in Postgres and served from
  `/api/images/[id]` with immutable caching, so no external bucket is needed.
  The seeded catalogue ships with a rendered photo per material — `scripts/png.ts`
  is a small PNG encoder and `scripts/textures.ts` paints a swatch per material
  type (board grain, tape coil, brushed metal, woven fabric, kraft carton and so
  on). They are placeholders for real product photography: replace any of them by
  editing the material and dropping in a real photo.
- **Excel parsing** with SheetJS, server-side only.
- **Charts** with Recharts.

### Layout

```
scripts/
  sql/001_init.sql       schema
  sql/002_companies.sql  group companies
  sql/003_process_flows.sql  process flows and runs
  migrate.ts seed.ts     database tooling
  create-user.ts         make or reset one account
  png.ts textures.ts     material photo generation
  seed-images.ts
  flow-data.ts           the 17 flows extracted from the workbook
  seed-flows.ts
src/
  app/
    (app)/               authenticated pages, each a server page + client view
    api/                 route handlers
    login/               sign-in
  components/            UI primitives, shell, shared widgets
  lib/
    db.ts                pool, query helpers, transaction()
    auth.ts session.ts   JWT signing, cookie reading, permission guards
    rbac.ts              roles, permissions, the matrix between them
    inventory.ts         postMovement() — the only path that changes stock
    import-map.ts        spreadsheet column aliases
    company.ts           company -> locations scoping
```

### Stock integrity

Every balance change goes through `postMovement()` in `src/lib/inventory.ts`,
inside a transaction. It writes the ledger row and moves `stock_levels` together,
and refuses any movement that would drive a location negative. Requisition
issues, GRN postings, transfers, adjustments and imports all use it, so the
ledger and the balances cannot drift apart.

## Deploying

The app is fully dynamic — API routes, middleware and server-rendered pages — so
it needs a Node runtime, not static hosting.

Nothing connects to the database during a build; the pool is created on the
first query. A build therefore needs no environment variables, but the site will
not work at runtime until these are set:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The Neon connection string, including `?sslmode=require` |
| `JWT_SECRET` | `openssl rand -hex 32` |

Then run `npm run db:migrate` (and optionally `db:seed`) against the production
database once.

**Netlify** — `netlify.toml` is committed and sets the build command, Node 20 and
`@netlify/plugin-nextjs`, which provides the server runtime. Add the two
variables above under *Site configuration → Environment variables* and redeploy.
Do not set a publish directory by hand; the plugin manages it.

**Vercel** — works as-is; set the same two variables.
