# TRT Nobox — Inventory

One place to see everything held in the TRT Factory and at Nobox. Designers
browse it and reserve stock for their projects; the Factory and Nobox managers
keep it up to date and issue reservations when the items leave the store.

## What it does

| Screen | Who | Covers |
|---|---|---|
| **Inventory** (`/inventory`) | Anyone, **no sign-in needed** | Every item from both sides, labelled **Factory** or **Nobox**, with available / reserved / in-stock figures. Filter by side, category and stock level; search; sort. Checks for changes every 3 seconds; changed or new items flash, and deductions pop up as notifications. **Reserve** (one item, or **Reserve from Excel**) asks a signed-out visitor to sign in and then brings them straight back to finish. |
| **Reservations** (`/reservations`) | Signed in | The reservation log: waiting to issue, issued, cancelled. Managers **Issue** (the items have left the store for production; only now is stock deducted) or **Release**. Designers can cancel their own. |
| **Factory** (`/factory`) | Factory manager, admin | Add, edit and delete items; **Add** and **Deduct** stock by any amount with a note; manage **Categories**; upload the Excel template; how many reservations are waiting to issue; recent changes. |
| **Nobox** (`/nobox`) | Nobox manager, admin | The same, for Nobox items. |
| **Team** (`/users`) | Admin | Accounts and roles. |

Light and dark themes, laid out for phone, tablet and desktop.

### Stock levels

- **Available** = in stock − reserved. It is what can still be reserved, and what
  the stock status is judged on.
- **Low stock**: available is above 0 and at or below the item's **Reorder Level**.
- **Out of stock**: nothing available. An item with a Reorder Level of 0 is never "low".

### Reservations

1. A designer reserves a quantity of an item for a project (form or Excel). It is
   set aside but **not** deducted. Anyone reserving the same item sees who else
   has it, and everyone signed in is notified live.
2. When the items leave the store for production, the Factory or Nobox manager
   **issues** the reservation. The app checks the stock is physically there, and
   only then deducts it. The designer is notified.
3. Or the manager releases it (or the designer cancels it), and it becomes
   available again with nothing deducted.

You cannot reserve more than is available, and a manual deduction or an upload
cannot eat into reserved stock. Every step is kept in the log.

**Reservation template** (`/api/reservations/template`): `SKU` · `From` (Factory or
Nobox) · `Quantity` · `Project` · `Notes`. Same rules as below: exact headers, every
problem listed, nothing reserved unless every row is fine.

### The Excel template

Download it from either dashboard (`/api/items/template`). Factory and Nobox use
the same one. The **Items** sheet has exactly these columns, in this order:

`SKU` · `Name` · `Category` · `Colour` · `Specification` · `Unit` · `Quantity` · `Reorder Level` · `Description`

- **The headers must match exactly.** A file with a renamed, reordered, added or
  missing column is rejected.
- **Quantity is added to current stock.** A negative number removes stock; 0
  changes details only. Stock can never go below zero.
- **SKU is optional.** Given, it matches an existing item on that side or creates
  one with that code. Blank, the row matches an existing item **by Name**, or
  creates a new one with a code made from the name (never clashing with an
  existing code). New items need a Name and a quantity of 0 or more. Each item may
  appear once per file.
- Blank optional cells keep the item's current value.
- **All or nothing.** The file is checked first and every problem is listed by
  row and column. If there is any problem, nothing is written.

The **Instructions** sheet in the template repeats these rules with examples.

### Roles

| Role | Can |
|---|---|
| Administrator | Everything, including accounts |
| Factory Manager | Change Factory items; see everything |
| Nobox Manager | Change Nobox items; see everything |
| Designer | Reserve stock; cancel their own reservations |

Browsing the inventory needs no account. Everything else does, and the rules are
enforced by every API route, not only hidden in the UI.

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
