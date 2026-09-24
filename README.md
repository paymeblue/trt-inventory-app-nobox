# TRT Nobox — Inventory

One place to see everything held in the TRT Factory and at Nobox. Designers
browse it and reserve stock for their projects; the Factory and Nobox managers
keep it up to date and issue reservations when the items leave the store.

## What it does

This is the TRT **Inventory Reservation and Stock Monitoring** workbook as an app:
Inventory_Master, its four forms and its four logs, with the same fields, the
same lookups, the same "Status Check" messages and the same Reorder_Status rule.

| Screen | Who | Workbook equivalent |
|---|---|---|
| **Inventory** (`/inventory`) | Anyone, no sign-in | Inventory_Master, read-only: every material by **Material_Code \| Name**, labelled Factory or Nobox, with Available_Qty and Reorder_Status. Live (checks every 3 s). |
| **Reservation Form** (Inventory → New reservation / Reserve) | Designers | Reservation_Form: Designer Name + Email (from the account), Project Name, Material (Code \| Name), Quantity Requested, Purpose / Notes; lookups Code, Name, Category, Specification, Dimensions, Unit, Available Qty; Status Check "Missing required fields" / "OUT OF STOCK" / "Insufficient available quantity". Also **Reserve from Excel**. Signed-out visitors are asked to sign in and brought back. |
| **Reservation Log** (`/reservations`) | Signed in | Reservation_Log: ID, timestamp, designer, project, material, reserved, issued, balance, status (Reserved, Part issued, Issued, Released). |
| **Stock Issue Form** | Factory / Nobox team | Stock_Issue_Form: Reservation ID, Quantity To Issue (part or all), Notes; lookups Project, Material, Reserved Qty, Already Issued, Balance To Issue, Available Inventory; "Issue exceeds remaining reservation balance". The stock must physically be there. Only issuing deducts reserved stock. |
| **Stock Addition Form** | Factory / Nobox team | Stock_Addition_Form: Material, Quantity Added, Supplier / Reference, Document Ref, Notes. |
| **Stock Adjustment Form** | Factory / Nobox team | Stock_Adjustment_Form: Related ID, Material, Adjustment Type (Return to Stock, Additional Issue, Reservation Release, Damage / Write-off, Count Gain, Count Loss), Quantity Impact; shows Stock / Reserved / Issued Impact Signed. |
| **Logs** (`/logs`) | Signed in | Stock_Issue_Log, Stock_Addition_Log, Stock_Adjustment_Log. |
| **Factory / Nobox** (`/factory`, `/nobox`) | That side's team, admin | Dashboard (Total Materials, Opening Qty, Available Qty, Reserved Qty, Issued Qty, Low Stock SKUs), the reorder alert list with Reorder_Quantity, the three forms, and Inventory_Master (Opening, Added, Reserved, Issued, In stock, Available, Reorder_Status). |
| **Team** (`/users`) | Admin | Accounts and roles. |

### Quantities, as the workbook defines them

- **In stock** = Opening_Qty + Stock_Added + adjustments − Issued.
- **Reserved_Qty** = what open and part-issued reservations still hold.
- **Available_Qty** = In stock − Reserved.
- **Reorder_Status**: OUT OF STOCK at 0 or below; REORDER NOW at or below Reorder_Level;
  LOW at or below 1.25 × Reorder_Level; otherwise OK. **Low Stock SKUs** counts all three.

One deliberate difference: the workbook's formulas move Available_Qty by *twice*
the quantity for a Return to Stock or an Additional Issue (they count it in both
Adjustment_Net_Stock and Issued_Qty). Here the goods move once; the three signed
impacts are still logged exactly as the form computes them.

### Loading the workbook

```bash
npm run db:import-workbook -- "INVENTORY RESERVATION AND STOCK MONITORING.xlsx"            # dry run + report
npm run db:import-workbook -- "INVENTORY RESERVATION AND STOCK MONITORING.xlsx" --commit   # write it
```

Imports Inventory_Master (codes, names, category, subcategory, specification,
dimensions, unit, Opening_Qty, Reorder_Level, Reorder_Quantity), Reservation_Log,
Stock_Issue_Log and Stock_Addition_Log with their original IDs and timestamps.
It is safe to run again. It prints every problem it found in the workbook (duplicate
IDs, a duplicated code, issues against reservations not in the log, codes with stray
spaces) and how it handled each, then reconciles Available_Qty against the workbook's
own formulas. Stock is derived from the logs, as the workbook's governance says it should be.
The Germana sinks marked "IN NOBOX" go to Nobox; everything else to the Factory.

### The Excel templates

Both are exact-header, all-or-nothing, and list every problem by row and column.

- **Stock** (`/api/items/template`), on Inventory_Master's names: `Material_Code` · `Material_Name` ·
  `Category` · `Subcategory` · `Specification` · `Dimensions` · `Unit` · `Quantity_Added` · `Reorder_Level` ·
  `Reorder_Quantity` · `Supplier_or_Reference` · `Document_Ref` · `Notes`. A new material starts with
  Quantity_Added as its Opening_Qty; on an existing one it is posted as a Stock Addition. Material_Code is
  optional (a blank row matches by name, or gets a generated code). Stock is removed only through the forms.
- **Reservations** (`/api/reservations/template`): `Material_Code` · `From` · `Quantity_Requested` ·
  `Project_Name` · `Purpose_Notes`.

### Roles

| Role | Can |
|---|---|
| Administrator | Everything, including accounts |
| Factory Manager / Nobox Manager | The inventory team for that side: addition, issue, adjustment, materials |
| Designer | The Reservation Form; cancel their own reservations |

As in the workbook's governance model, designers only reserve, and logs are never
edited: every correction is a new adjustment.

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL and JWT_SECRET
npm run db:migrate             # create the schema
npm run db:seed                # optional: demo items + accounts
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
| `npm test` | Upload and reservation tests against a real Postgres. Needs `TEST_DATABASE_URL`, an **empty** database whose name contains `test`; it is wiped on every run. |
| `npm run db:migrate` | Apply everything in `scripts/sql/`, tracked in `_migrations` |
| `npm run db:seed` | Demo accounts, items on both sides and two open reservations (empty database only) |
| `npm run db:reset` | **Drops the public schema.** Follow with `db:migrate` |
| `npm run db:import-workbook -- "<file.xlsx>" [--commit]` | Load the TRT inventory workbook (see above) |
| `npm run db:user -- <email> <password> "<name>" [ROLE]` | Create or update one account. `ROLE` is `ADMIN`, `FACTORY_MANAGER`, `NOBOX_MANAGER` or `DESIGNER`. |

### Demo accounts

Seeded by `npm run db:seed`. Password for all of them: **`trtnobox2026`**.

| Email | Role |
|---|---|
| `admin@trtnobox.com` | Administrator |
| `factory@trtnobox.com` | Factory Manager |
| `nobox@trtnobox.com` | Nobox Manager |
| `design@trtnobox.com` | Designer |

Change these before the system is used for real work, with `npm run db:user` or
from the Team page.

## How it is built

- **Next.js 16** (App Router) and **React 19**, TypeScript throughout.
- **Tailwind CSS v4** with a token-based theme in `src/app/globals.css`.
- **Postgres** through `pg`, plain SQL. Schema in `scripts/sql/`.
- **JWT auth**: `jose`-signed token in an httpOnly cookie, `bcryptjs` hashes.
  `src/proxy.ts` verifies the token before any page renders.
- **Images** are stored as `bytea` in Postgres and served from `/api/images/[id]`.
  Seeded items get a rendered swatch (`scripts/png.ts`, `scripts/textures.ts`);
  replace it by editing the item and dropping in a photo.
- **Excel** read and written with SheetJS, server-side only.

### Layout

```
scripts/
  sql/                   migrations; 004 is the current model
  migrate.ts seed.ts     database tooling
  create-user.ts         make or reset one account
  png.ts textures.ts     swatch generation for seeded items
src/
  app/(app)/             inventory, reservations, factory, nobox, users
  app/api/items/         list, create, edit, delete, adjust, import, template, activity, version
  app/api/reservations/  log, reserve, issue / cancel, events, import, template
  app/api/categories/    list, create, rename, delete
  components/items/      shared list hook (live polling), filters, detail
  components/manage/     manager dashboard, item form, add/deduct, categories, upload
  components/reservations/ reserve dialog, Excel reserve, live notifications
  lib/
    rbac.ts              roles, sides, who can change what
    items.ts             quantity changes and the stock import, inside transactions
    reservations.ts      reserve, issue, cancel
    template.ts          the stock template: its columns, the file it builds, the parser
    reservation-template.ts  the reservation template and its import
tests/                   node:test suites, run against a real Postgres
```

### Stock integrity

Quantities only change through `adjustQuantity()` and `importStock()` in
`src/lib/items.ts` and `issueReservation()` in `src/lib/reservations.ts`, each
inside a transaction that locks the item first. All three write a row to
`item_movements` alongside the new balance. None lets a quantity go negative (the
column has a `CHECK` as well), and none lets it drop below what is reserved.

## Deploying

The app needs a Node runtime (API routes, proxy, server-rendered pages).

Nothing connects to the database during a build, so a build needs no
environment variables. The site will not work at runtime until `DATABASE_URL`
and `JWT_SECRET` are set, and `npm run db:migrate` has been run against the
production database. **The build does not run migrations.**

**Netlify**: `netlify.toml` sets the build command, Node 20 and
`@netlify/plugin-nextjs`. Add the two variables under *Site configuration →
Environment variables*.
