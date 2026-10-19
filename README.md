# TRT Nobox — Inventory

One place to see everything held in the TRT Factory and at Nobox. Designers
and the sales teams browse it and reserve stock for their projects and orders; the Factory and Nobox managers
keep it up to date and issue reservations when the items leave the store.

## What it does

This is the TRT **Inventory Reservation and Stock Monitoring** workbook as an app:
Inventory_Master, its four forms and its four logs, with the same fields, the
same lookups, the same "Status Check" messages and the same Reorder_Status rule.

| Screen | Who | Workbook equivalent |
|---|---|---|
| **Inventory** (`/inventory`) | Anyone, no sign-in | Inventory_Master, read-only: every material by **Material_Code \| Name**, labelled Factory or Nobox, with Available_Qty and Reorder_Status. Live (checks every 3 s). |
| **Reservation Form** (Inventory → New reservation / Reserve) | Designers, Sales | Reservation_Form: Reserved By + Email (from the account), For (Design or Sales, from the role; an administrator picks), Project Name, Material (Code \| Name), Quantity Requested, Purpose / Notes; lookups Code, Name, Category, Specification, Dimensions, Unit, Available Qty; Status Check "Missing required fields" / "OUT OF STOCK" / "Insufficient available quantity". Also **Reserve from Excel**. Signed-out visitors are asked to sign in and brought back. |
| **Reservation Log** (`/reservations`) | Signed in | Reservation_Log: ID, timestamp, designer, project, material, reserved, issued, balance, status (Reserved, Part issued, Issued, Released). |
| **Stock Issue Form** | Each side's team | Stock_Issue_Form: Reservation ID, Quantity To Issue (part or all), Notes; lookups Project, Material, Reserved Qty, Already Issued, Balance To Issue, Available Inventory; "Issue exceeds remaining reservation balance". The stock must physically be there. Only issuing deducts reserved stock. |
| **Stock Addition Form** | Each side's team | Stock_Addition_Form: Material, Quantity Added, Supplier / Reference, Document Ref, Notes. |
| **Stock Adjustment Form** | Each side's team | Stock_Adjustment_Form: Related ID, Material, Adjustment Type (Return to Stock, Additional Issue, Reservation Release, Damage / Write-off, Count Gain, Count Loss), Quantity Impact; shows Stock / Reserved / Issued Impact Signed. |
| **Issuance Log** (`/issuance`) | Signed in | Stock_Issue_Log, with who reserved each issue (name, job title, email), the project and purpose, and what is still to issue. Each side's team gets **Issue Stock** here and in the sidebar. |
| **Stock logs** (`/logs`) | Admin in the sidebar; managers from their dashboard | Stock_Addition_Log, Stock_Adjustment_Log. |
| **Factory / Nobox / Ready Cabinets / Germana** (`/factory`, `/nobox`, `/ready-cabinets`, `/germana`) | That side's team, admin | Dashboard (Total Materials, Opening Qty, Available Qty, Reserved Qty, Issued Qty, Low Stock SKUs), the reorder alert list with Reorder_Quantity, the three forms, and Inventory_Master (Opening, Added, Reserved, Issued, In stock, Available, Reorder_Status). |
| **Categories** (`/categories`) | Each side's team, admin | Every category with its items and how many have stock. The **Active** switch archives a category: its items are kept but hidden from the inventory, the dashboards and their counts. "Archive the ones with no stock" does it in one click. Adding stock to an item re-activates its category. Rename, add, delete (empty only). |
| **Team** (`/users`) | Admin | Accounts and roles. Disable an account, or delete it for good (logs keep the person's name; you cannot delete yourself or the last administrator). |

### Quantities, as the workbook defines them

- **In stock** = Opening_Qty + Stock_Added + adjustments − Issued.
- **Reserved_Qty** = what open and part-issued reservations still hold.
- **Available_Qty** = In stock − Reserved.
- **Reorder_Status**: OUT OF STOCK at 0 or below; REORDER NOW at or below Reorder_Level;
  LOW at or below 1.25 × Reorder_Level; otherwise OK. **Low Stock SKUs** counts all three.

### Reorder_Level and Reorder_Quantity are worked out automatically

From what each material uses: its issues over the last 90 days (at least 7 for a new material), less any
Return to Stock (`src/lib/reorder.ts`).

- **Reorder_Level** = daily usage × lead time + 1.65 × σ(daily usage) × √lead time (lead-time demand plus safety stock).
- **Reorder_Quantity** = daily usage × days of cover.

Each side has a default lead time (14 days) and days of cover (30), under **Settings** on the dashboard's Reorder
alert; a material may have its own lead time. A value typed on the material, or given in the upload, is kept until
it is cleared (blank in the app, `AUTO` in Excel). The figures are worked out again whenever stock is issued or
returned, and at least hourly. A material nothing has been issued from has a Reorder_Level of 0.

### Design and Sales

Designers and the sales teams (the **Sales** role) reserve stock the same way. Every reservation is marked
**Design** or **Sales** for the person responsible, in the Reservation Log, the Issuance Log, the Stock Issue form
and the notifications.

One deliberate difference: the workbook's formulas move Available_Qty by *twice*
the quantity for a Return to Stock or an Additional Issue (they count it in both
Adjustment_Net_Stock and Issued_Qty). Here the goods move once; the three signed
impacts are still logged exactly as the form computes them.

### Nobox stores: Lagos and Abuja

Every Nobox material is tagged with the store that holds it, **Lagos** or **Abuja**.
The same material in both is two rows with their own stock, reservations and logs,
and a location badge everywhere it is shown. The Nobox dashboard and the designers'
Nobox tab can be filtered by store. The other sides have no locations.

### Starting empty

The system holds no sample data. `npm run db:clear-data -- --confirm` empties the
inventory (materials, photos, categories, reservations and every log, on every side)
and keeps all accounts; reference numbers start again at 00001. Stock then comes in
through each side's **Import from Excel**.

### The Excel templates

Both are all-or-nothing and list every problem by row and column.

- **Stock** (`/api/items/template?source=NOBOX`, one per side; **Template** on each dashboard), on
  Inventory_Master's names: `Material_Code` · `Material_Name` · `Category` · `Subcategory` · `Specification` ·
  `Dimensions (W*D*H)MM` · `Unit` · `Quantity_Added` · `Reorder_Level` · `Reorder_Quantity` ·
  `Lead_Time_Days` · `Supplier_or_Reference` · `Document_Ref` · `Notes`. On Nobox, `Quantity_Added` is two columns,
  `Quantity_Added (Lagos)` and `Quantity_Added (Abuja)`, each applied to its own store; a new material with
  both blank is created in Lagos.
  - Columns are matched by header, in any order; common spellings such as `Quantity_Added (lag)` or
    `Specification ` are accepted, unknown columns are rejected.
  - A new material starts with its quantity as Opening_Qty; on an existing one it is posted as a Stock
    Addition. Stock is removed only through the forms.
  - Material_Code is optional (a blank row matches by name, or gets a generated code). A code may be shared
    by several materials, as the workbook does for each finish and size of a handle (`YXJ-0042` MATT GOLD
    1 METRE, MATT GOLD 25CM…): the row's name, subcategory, specification and dimensions pick the one it means.
  - A repeated row with no quantity is ignored; a repeated row with a quantity is an error.
  - **Export** (`&filled=1`) downloads the template filled with the side's current materials, quantities blank,
    to edit and upload again. Reorder figures appear only where they were set by hand, so a re-upload never pins
    a calculated one.
- **Reservations** (`/api/reservations/template`): `Material_Code` · `Material_Name` · `From` · `Location` ·
  `Quantity_Requested` · `Project_Name` · `Purpose_Notes`. Material_Name is needed only when a code is shared;
  Location (Lagos or Abuja) only when a Nobox material is held in both.

### Nobox products workbook

`docs/TRT Nobox products.xlsx` is the Nobox product list as loaded into production (303 products, opening
stock in Lagos), in the Nobox template: header frozen, an Excel table with filters, drop-downs for Unit and
Category, quantity checks, a Summary sheet per category, the allowed Lists, and a Review sheet of rows worth
checking (generated codes, codes that read like descriptions, shared codes, removed duplicates). Clear its
quantity columns before uploading it again, or the opening stock is added twice.

`npm run db:import-stock -- "<file.xlsx>" NOBOX <account email> [--commit]` uploads a workbook from the
command line exactly as Import from Excel does; without `--commit` it only checks.

### Product photos

After an upload, managers add photos row by row: click the photo square beside a material on the dashboard
(`PUT /api/items/:id/image`, `DELETE` to remove). **No photo yet** in the status filter lists what is missing.
The material's edit form can also change or remove its photo. Materials without a photo show a
"No image yet" placeholder (`ProductPlaceholder`, an inline SVG that follows the theme) to designers and visitors.

### Roles

| Role | Can |
|---|---|
| Administrator | Everything, including accounts |
| Factory, Nobox, Ready Cabinets and Germana Managers | The inventory team for that side: Import from Excel, Stock Issue against reservations, addition, adjustment, materials. They do not reserve. |
| Designer | The Reservation Form (and Reserve from Excel); cancel their own reservations |

As in the workbook's governance model, designers only reserve, and logs are never
edited: every correction is a new adjustment.

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL and JWT_SECRET
npm run db:migrate             # create the schema
npm run db:seed                # optional: starting accounts (no materials)
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
| `npm run db:seed` | Starting accounts only, no materials (empty database only) |
| `npm run db:reset` | **Drops the public schema.** Follow with `db:migrate` |
| `npm run db:import-stock -- "<file.xlsx>" <SIDE> <email> [--commit]` | Upload a stock workbook as that account (see above) |
| `npm run db:clear-data -- --confirm` | Empty the inventory on every side and keep the accounts (see above) |
| `npm run db:user -- <email> <password> "<name>" [ROLE]` | Create or update one account. `ROLE` is `ADMIN`, `FACTORY_MANAGER`, `NOBOX_MANAGER`, `READY_CABINETS_MANAGER`, `GERMANA_MANAGER`, `DESIGNER` or `SALES`. |

### Starting accounts

Created by `npm run db:seed` in an empty database. Password for all of them: **`trtnobox2026`**.

| Email | Role |
|---|---|
| `admin@trtnobox.com` | Administrator |
| `factory@trtnobox.com` | Factory Manager |
| `nobox@trtnobox.com` | Nobox Manager |
| `readycabinets@trtnobox.com` | Ready Cabinets Manager |
| `germana@trtnobox.com` | Germana Manager |
| `design@trtnobox.com` | Designer |
| `sales@trtnobox.com` | Sales |

Change these before the system is used for real work, with `npm run db:user` or
from the Team page.

## How it is built

- **Next.js 16** (App Router) and **React 19**, TypeScript throughout.
- **Tailwind CSS v4** with a token-based theme in `src/app/globals.css`.
- **Postgres** through `pg`, plain SQL. Schema in `scripts/sql/`.
- **JWT auth**: `jose`-signed token in an httpOnly cookie, `bcryptjs` hashes.
  `src/proxy.ts` verifies the token before any page renders.
- **Images** are stored as `bytea` in Postgres and served from `/api/images/[id]`.
  A replaced photo is deleted once no material shows it.
- **Excel** read and written with SheetJS, server-side only.

### Layout

```
scripts/
  sql/                   migrations; 004 is the current model
  migrate.ts seed.ts     database tooling
  clear-data.ts          empty the inventory, keep the accounts
  create-user.ts         make or reset one account
src/
  app/(app)/             inventory, reservations, factory, nobox, users
  app/api/items/         list, create, edit, delete, photo, import, template, activity, version
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
