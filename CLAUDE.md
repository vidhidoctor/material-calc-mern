# CLAUDE.md — Material Calculation System (MERN)

**Read [docs/context.md](docs/context.md) before any task.** Reference data and expected results: [docs/fixture-26-49.json](docs/fixture-26-49.json).

## Stack

| Part | Choice |
|---|---|
| Language | TypeScript everywhere (strict) |
| Repo | npm workspaces monorepo: `client/`, `server/`, `shared/` |
| Database | MongoDB Atlas (free tier), Mongoose 8 |
| API | Node 22+ (LTS), Express 5 (async errors handled natively), Zod for validation |
| Frontend | Vite + React 19 + React Router 7 + TanStack Query 5, plain CSS with design tokens |
| Maths | `decimal.js` for every quantity calculation |
| Auth | opaque session tokens stored hashed in MongoDB (real logout), passwords hashed with Node `crypto.scrypt` |
| Tests | `node:test` + `supertest` + `mongodb-memory-server` (API tests never touch Atlas) |

## Folder layout

```text
client/   Vite + React app (built into client/dist and served by the API in deployments)
server/   Express API
  src/server.ts            listen only;  src/app.ts  express + /api routes + 404 + error handler
  src/config/env.ts        Zod-validated env (loads server/.env)
  src/middleware/          error-handler, validate (Zod), auth (authenticate / requirePermission / guard)
  src/modules/<m>/         <m>.model / .validation / .service / .controller / .routes
                           auth, users, roles, departments, admin, materials, designs, design-costing, job-work-costing, print-config, orders, production, purchase
  src/calculation/         pure engine (decimal.js) — must not import mongoose, express or modules/
  src/lib/                 AppError, crypto (scrypt, tokens), zod helpers, logger
  scripts/seed.ts          npm run seed;  tests/  node:test + supertest + mongodb-memory-server
shared/   @app/shared: constants (permissions, roles, MESSAGES …) and API DTO types, consumed as TS source
docs/     project context and reference fixture
```

Commands (from the root): `npm run dev`, `npm run dev:client`, `npm test`, `npm run typecheck`, `npm run build`, `npm start`.
Deployment: render.yaml (UAT from dev_vidhi, production later from main); `APP_ENV` = local | uat | production.
Imports in server/ and shared/ end in `.js` (NodeNext ESM).

## Rules

- Layers: routes → controller → service → model. Calculation code is pure (no DB, no I/O).
- All quantity maths uses `decimal.js`; send numbers to the client as strings.
- Names, codes, design numbers, components and sizes are stored upper-case (and trimmed).
- Every route is validated with Zod and guarded by a permission (checked by permission code, never role name).
- Never commit `.env` — only `server/.env.example` with placeholders.
- Orders follow the design (context §8): no consumption copy on order lines; sizes/components used by
  an order cannot be removed. Design consumption is stored as `[{ material, color, qty }]` (codes may contain dots).
- Colour variants are entered in Punching, not Admin: a column key is `CODE` or `CODE|COLOUR` (shared/src/variants.ts).
  Each component stores its chosen columns; requirements and purchase are computed per material + colour.
- Category types (e.g. sequence finish MATT/METAL/GLASS) are defined by Admin; Punching must give typed materials a
  colour; Production picks the type per order (`order.types`, key `CODE|COLOUR^TYPE`); purchase and cost follow the type.
- Don't seed sample data (fixture 26-49) into Atlas; the fixture is for tests only. The user enters real data.
- Design Costing (modules/design-costing, one record per design): stitch and laser rates are entered per component + size
  and never go in Material Master; base cost, markup and final price are pure maths in calculation/design-costing.ts. It
  chooses its own type/denier/rate for typed and cord columns (orders still choose theirs). Figures on screen come from the
  server (`/preview`), not client maths.
- Job Work Costing (modules/job-work-costing, a tab of Design Costing, its own record per design; its header, pending inputs and
  cards share the page's layout, only what is below the tabs differs per tab): per size: job worker rate, stitch and laser
  rates and heads, and its own stitch/laser quantities (blank = Punching Master); materials excluded because the rate covers them.
  Final cost = job worker rate + stitch cost + laser cost + included materials. It only reads punching details, material costs and the
  design costing's type/cord choices, and never writes to them.
- Shared UI: tabs use components/Tabs (`useTabParam` keeps the tab in the address), figures use components/StatCard, printed
  sheets use components/PrintHeader + the `.po-*` styles (purchase order, price list); printed costing tables use
  components/ColumnPrintSheet (modules/print-config: columns saved in the database per sheet, one setup for everyone, changed with
  DESIGN_COSTING_MANAGE; column ids and defaults in PRINT_SHEETS). Don't make new versions of these.
- Audit (modules/audit): every route that changes data gets `audited({ action, entity, id })` (before → after snapshot
  diff, recorded only on success); new actions go in `AUDIT_ACTIONS`, new record kinds in `audit.entities.ts`. The audit
  log is append-only (no update/delete, enforced in the model); passwords/tokens are never logged; Admin → Audit Log
  needs AUDIT_VIEW, a record's History needs the permission that shows the record (costs masked without COST_VIEW).

## Git

- Work happens on `dev_vidhi`; `main` is production. No force-push.
