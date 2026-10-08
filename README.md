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
