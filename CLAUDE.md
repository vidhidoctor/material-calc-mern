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

## Folder layout (planned — created in later steps)

```text
client/   Vite + React app
server/   Express API (routes → controller → service → model)
shared/   types, Zod schemas, validation messages shared by client and server
docs/     project context and reference fixture
```

## Rules

- Layers: routes → controller → service → model. Calculation code is pure (no DB, no I/O).
- All quantity maths uses `decimal.js`; send numbers to the client as strings.
- Names, codes, design numbers, components and sizes are stored upper-case (and trimmed).
- Every route is validated with Zod and guarded by a permission (checked by permission code, never role name).
- Never commit `.env` — only `server/.env.example` with placeholders.

## Git

- Work happens on `dev_vidhi`; `main` is production. No force-push.
