# TRT Nobox — Inventory

One place to see everything held in the TRT Factory and at Nobox. Designers
browse it; the two managers keep it up to date, by hand or from Excel.

## What it does

| Screen | Who | Covers |
|---|---|---|
| **Inventory** (`/inventory`) | Everyone | Every item from both sides in one grid or table, each labelled **Factory** or **Nobox**. Filter by side, category and stock level; search by name, SKU, colour or spec; sort by name, quantity or last change. Refreshes every 10 seconds (and whenever the tab regains focus), and an item whose quantity just changed flashes. Read-only. |
| **Factory** (`/factory`) | Factory manager, admin | Add, edit and delete Factory items; +1 / −1 or adjust by any amount with a note; upload the Excel template; recent changes. |
| **Nobox** (`/nobox`) | Nobox manager, admin | The same, for Nobox items. |
| **Team** (`/users`) | Admin | Accounts and roles. |

Light and dark themes, laid out for phone, tablet and desktop.

### The Excel template

Download it from either dashboard (`/api/items/template`). Factory and Nobox use
the same one. The **Items** sheet has exactly these columns, in this order:

`SKU` · `Name` · `Category` · `Colour` · `Specification` · `Unit` · `Quantity` · `Reorder Level` · `Description`

- **The headers must match exactly.** A file with a renamed, reordered, added or
  missing column is rejected.
- **Quantity is added to current stock.** A negative number removes stock; 0
  changes details only. Stock can never go below zero.
- **SKU matches an existing item on that side**, or creates a new one (which then
  needs a Name and a quantity of 0 or more). Each SKU may appear once per file.
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
| Designer | See everything; change nothing |

Rules are enforced by every API route, not only hidden in the UI.

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
| `npm run db:migrate` | Apply everything in `scripts/sql/`, tracked in `_migrations` |
| `npm run db:seed` | Demo accounts and items on both sides (empty database only) |
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
  app/(app)/             inventory, factory, nobox, users
  app/api/items/         list, create, edit, delete, adjust, import, template, activity
  components/items/      shared list hook (live polling), filters, detail
  components/manage/     manager dashboard, item form, adjust, upload
  lib/
    rbac.ts              roles, sides, who can change what
    items.ts             quantity changes and the import, inside transactions
    template.ts          the template: its columns, the file it builds, the parser
```

### Stock integrity

Quantities only change through `adjustQuantity()` and `applyImport()` in
`src/lib/items.ts`, each inside a transaction that locks the rows it touches.
Both write a row to `item_movements` alongside the new balance, and neither lets
a quantity go negative (the column has a `CHECK` as well).

## Deploying

The app needs a Node runtime (API routes, proxy, server-rendered pages).

Nothing connects to the database during a build, so a build needs no
environment variables. The site will not work at runtime until `DATABASE_URL`
and `JWT_SECRET` are set, and `npm run db:migrate` has been run against the
production database. **The build does not run migrations.**

**Netlify**: `netlify.toml` sets the build command, Node 20 and
`@netlify/plugin-nextjs`. Add the two variables under *Site configuration →
Environment variables*.
