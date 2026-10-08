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
client/   Vite + React app (not created yet: step 3)
server/   Express API
  src/server.ts            listen only;  src/app.ts  express + /api routes + 404 + error handler
  src/config/env.ts        Zod-validated env (loads server/.env)
  src/middleware/          error-handler, validate (Zod), auth (authenticate / requirePermission / guard)
  src/modules/<m>/         <m>.model / .validation / .service / .controller / .routes
                           auth, users, roles, departments, admin, materials, designs, orders, production, purchase
  src/calculation/         pure engine (decimal.js) — must not import mongoose, express or modules/
  src/lib/                 AppError, crypto (scrypt, tokens), zod helpers, logger
  scripts/seed.ts          npm run seed;  tests/  node:test + supertest + mongodb-memory-server
shared/   @app/shared: constants (permissions, roles, MESSAGES …) and API DTO types, consumed as TS source
docs/     project context and reference fixture
```

Commands (from the root): `npm run dev`, `npm run seed`, `npm test`, `npm run typecheck`.
Imports in server/ and shared/ end in `.js` (NodeNext ESM).

## Rules

- Layers: routes → controller → service → model. Calculation code is pure (no DB, no I/O).
- All quantity maths uses `decimal.js`; send numbers to the client as strings.
- Names, codes, design numbers, components and sizes are stored upper-case (and trimmed).
- Every route is validated with Zod and guarded by a permission (checked by permission code, never role name).
- Never commit `.env` — only `server/.env.example` with placeholders.
- Orders follow the design (context §8): no consumption copy on order lines; sizes/components used by
  an order cannot be removed. Design consumption is stored as `[{ material, qty }]` (codes may contain dots).
- Don't seed sample data (fixture 26-49) into Atlas; the fixture is for tests only. The user enters real data.

## Git

- Work happens on `dev_vidhi`; `main` is production. No force-push.
