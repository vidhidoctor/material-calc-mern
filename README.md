# Material Calculation System

An embroidery/garment unit makes designs (e.g. a Lehenga Choli). Each design is made of components (KALI, BLOUSE, GALISH, BELT, FROCK …), each in several sizes (18, 20 … 40, or ALL), and every piece of a component + size consumes a fixed amount of materials (sequences, beads, cord …). The Punching department defines, per design, the components, sizes and material consumed by one piece (replacing the MATRIAL.xlsx sheet); the Production department finds a design, creates production orders for it, and uses the calculated purchase requirement to buy material; Admin controls users, roles, permissions and the material list.

Work happens on dev_vidhi; main is production.

## Setup

Requirements: Node 22+ (LTS) and a free MongoDB Atlas cluster.

1. **Install**: `npm install` (from the repo root; installs every workspace).
2. **Atlas**: create a cluster, a database user, and allow your IP (Network Access). Copy the
   connection string from *Connect → Drivers*.
3. **Environment**: copy `server/.env.example` to `server/.env` and fill in `MONGODB_URI`
   (add a database name, e.g. `/material-calc`), `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
   `server/.env` is git-ignored. Never commit it.
4. **Seed**: `npm run seed` creates departments, roles (Admin always gets every permission) and
   the first Admin user. Safe to run again; it never overwrites an existing password.
5. **Run**: `npm run dev` starts the API on http://localhost:4000 (`GET /api/health`).

| Command | What it does |
|---|---|
| `npm run dev` | API with auto-reload (tsx watch) |
| `npm run seed` | Seed / re-seed foundation data |
| `npm test` | API tests on an in-memory MongoDB (never touches Atlas) |
| `npm run typecheck` | TypeScript check of every workspace |

## API

All routes are under `/api`. Except for auth, every route needs `Authorization: Bearer <token>`
and the permission listed. Errors are returned as `{ error, details? }`. Calculated quantities
are decimal strings.

| Method | Path | Body / query | Permission |
|---|---|---|---|
| POST | `/auth/signup` | `{ name, email, password }` | — (creates an inactive account) |
| POST | `/auth/login` | `{ email, password }` → `{ token, expiresAt, user }` | — |
| POST | `/auth/logout` | — | logged in |
| GET | `/auth/me` | — | logged in |
| POST | `/auth/forgot-password` | `{ email }` | — |
| POST | `/auth/reset-password` | `{ token, password }` | — |
| GET | `/admin/users` | — | USER_VIEW |
| POST | `/admin/users` | `{ name, email, password, roleId?, departmentId?, isActive? }` | USER_CREATE |
| PATCH | `/admin/users/:id` | `{ name?, roleId?, departmentId?, isActive?, password? }` | USER_UPDATE |
| DELETE | `/admin/users/:id` | — | USER_DELETE |
| GET | `/admin/roles` | — | ROLE_MANAGE, PERMISSION_MANAGE or USER_VIEW |
| POST | `/admin/roles` | `{ name, permissions? }` | ROLE_MANAGE |
| PUT | `/admin/roles/:id/permissions` | `{ permissions }` | PERMISSION_MANAGE |
| GET | `/admin/permissions` | — | ROLE_MANAGE or PERMISSION_MANAGE |
| GET | `/admin/departments` | — | DEPARTMENT_MANAGE or USER_VIEW |
| POST | `/admin/departments` | `{ name }` | DEPARTMENT_MANAGE |
| GET | `/materials` | — | MATERIAL_MASTER_VIEW |
| POST | `/materials` | `{ code, name, category, seqPerCd?, cdPerRoll?, cdPerRound?, pcsPerKg?, denier? }` | MATERIAL_MASTER_MANAGE |
| PUT | `/materials/:code` | same without `code` (code cannot change) | MATERIAL_MASTER_MANAGE |
| DELETE | `/materials/:code` | — (409 while a design uses it) | MATERIAL_MASTER_MANAGE |
| GET | `/designs` | `?q=` (ignores case, spaces, dashes) | PUNCHING_VIEW |
| POST | `/designs` | `{ designNo, productName }` | PUNCHING_CREATE |
| GET | `/designs/:designNo` | — (design + material columns) | PUNCHING_VIEW |
| PATCH | `/designs/:designNo` | `{ productName }` | PUNCHING_UPDATE |
| PUT | `/designs/:designNo/components/:name` | `{ sizes: [{ size, stitch, laser?, consumption: { CODE: qty } }] }` | PUNCHING_CREATE + PUNCHING_UPDATE |
| DELETE | `/designs/:designNo/components/:name` | — (409 while an order uses it) | PUNCHING_UPDATE |
| GET | `/production/designs` | `?q=` (designs with ≥1 component + counts) | PRODUCTION_VIEW |
| GET | `/production/designs/:designNo` | — (design + previous orders) | PRODUCTION_VIEW |
| GET | `/orders` | — (newest first) | PRODUCTION_VIEW |
| POST | `/orders` | `{ designNo, party, orderDate?, quantity }` or `{ designNo, party, orderDate?, lines: [{ component, size, quantity }] }` | PRODUCTION_CREATE |
| GET | `/orders/:orderNo` | — | PRODUCTION_VIEW |
| PATCH | `/orders/:orderNo/status` | `{ status }` | PRODUCTION_UPDATE |
| GET | `/orders/:orderNo/summary` | — (requirement per row + totals) | PRODUCTION_VIEW |
| GET | `/purchase/requirements` | `?orderNo=&components=KALI,GALISH` (no order = all except CANCELLED) | PURCHASE_REQUIREMENT_VIEW |

Orders follow the design (docs/context.md §8): figures always use the design's current consumption,
and sizes/components used by an order cannot be removed.
