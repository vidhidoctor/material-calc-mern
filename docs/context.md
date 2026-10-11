# Project context — Material Calculation System (MERN rebuild)

Read this whole file before doing any step. Every later step file assumes it.

This is a rebuild of an existing working system (Postgres/Prisma version) on the MERN stack.
The business rules, numbers and screens below are FINAL — they are what the first version
ended up with after many changes. Build the final version directly; do not reproduce the
intermediate versions.

---

## 1. What the business does

An embroidery/garment unit makes designs (e.g. a Lehenga Choli). Each design is made of
**components** (KALI, BLOUSE, GALISH, BELT, FROCK …), each in several **sizes** (18, 20 … 40, or ALL).
Every piece of a component + size consumes a fixed amount of materials (sequences, beads, cord …).

Two departments use the system:

- **Punching** — defines, per design, the components, their sizes and the material consumed
  by ONE piece (the "Punching Master"). This replaces an Excel sheet (MATRIAL.xlsx).
- **Production** — finds a design, creates production orders for it (party + quantities), and
  uses the calculated **purchase requirement** to buy material.

**Admin** controls users, roles, permissions and the material list.

---

## 2. Stack (decided)

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

---

## 3. Roles and permissions

Access is always checked by **permission code**, never by role name. Roles are named sets of
permissions that Admin can edit at runtime.

| Permission | Meaning |
|---|---|
| PUNCHING_VIEW / PUNCHING_CREATE / PUNCHING_UPDATE | Punching Master (designs, components, sizes, consumption) |
| PRODUCTION_VIEW / PRODUCTION_CREATE / PRODUCTION_UPDATE | Design search, orders, order status |
| PURCHASE_REQUIREMENT_VIEW | Purchase Requirements page |
| MATERIAL_MASTER_VIEW / MATERIAL_MASTER_MANAGE | Material list (the consumption columns) and conversion rules |
| USER_VIEW / USER_CREATE / USER_UPDATE / USER_DELETE | Users |
| ROLE_MANAGE / PERMISSION_MANAGE / DEPARTMENT_MANAGE | Roles, role permissions, departments |

Seeded roles:

- **Admin** — every permission (the seed always re-grants all permissions to Admin).
- **Punching Employee** — PUNCHING_VIEW, PUNCHING_CREATE, PUNCHING_UPDATE.
- **Production Employee** — PRODUCTION_VIEW, PRODUCTION_CREATE, PRODUCTION_UPDATE, PURCHASE_REQUIREMENT_VIEW.

Seeded departments: Administration, Punching, Production.

Security rules (keep all of them):

1. Sign-up creates an **inactive** user with no role; they cannot log in until Admin assigns
   department + role and activates them ("Account is waiting for Admin activation.").
2. Nobody can grant a role or permission they don't hold themselves (no privilege escalation).
3. Admin cannot deactivate/delete themselves, change their own role, or remove PERMISSION_MANAGE
   from their own role.
4. Deactivating a user or changing their password ends all their sessions immediately.
5. User, role and permissions are loaded fresh on every request (changes apply immediately).
6. Forgot-password always answers the same message (does not reveal which emails exist). No email
   service yet: log the reset token and, outside production, return it as `devResetToken`.
7. Reset token valid 30 min, single use; a reset ends all sessions. Sessions last 12 h.

---

## 4. Data model (MongoDB) — final

All names, codes, design numbers, components and sizes are stored **upper-case and trimmed**.

```text
materials      { code (unique, e.g. "SEQ-3MM"), name, category: SEQUENCE|BEAD|CORD, sortOrder,
                 seqPerCd?, cdPerRoll?, cdPerRound?, pcsPerKg?, denier? }

designs        { designNo (unique, e.g. "26-49"), productName (e.g. "Lehenga Choli"), createdAt,
                 components: [ { name ("KALI"),
                                 sizes: [ { size ("18"), stitch (int ≥0, required), laser (int ≥0, optional),
                                            consumption: [{ material, color (null or e.g. "WHITE"), qty (>0) }] } ],
                                 materials: ["SEQ-3MM", "SEQ-3MM|WHITE", …] (columns chosen for the component) } ] }
                 // component names unique within a design; sizes unique within a component

orders         { orderNo (sequential int from a counters collection; internal id used in links),
                 partyOrderNo (1, 2, 3 … per design + party, from counter "party:<designNo>:<party>";
                 shown as "ABC-1", or "#1" inside a party section), designNo, item
                 (= design.productName at creation), party, orderDate (date only), quantity (int | null —
                 null means "per row"), status: PENDING|IN_PROGRESS|COMPLETED|CANCELLED, createdAt,
                 lines: [ { component, size, quantity (int > 0) } ] }   // no consumption copy, see §8

counters       { _id: "orderNo", seq }

users          { name, email (unique, lower-case), passwordHash, isActive, roleId?, departmentId?, createdAt }
roles          { name (unique), permissions: [code] }
departments    { name (unique) }
sessions       { tokenHash (unique), userId, expiresAt }          // TTL index on expiresAt
passwordResets { tokenHash (unique), userId, expiresAt, usedAt? }
```

---

## 5. Calculation rules (do not change)

For a set of order lines:

1. **Row requirement** = consumption per piece × line quantity (per material).
2. **Total requirement (Level 1)** = sum of row requirements per material. Unit: PCS, except CORD in MTR.
3. **Purchase requirement (Level 2)**, by material category. Categories are configured by Admin
   (Material Master → Categories, decided 2026-10-11): each has a unit, the fields every material
   fills in, and ordered formula steps using `TOTAL` (the required quantity), the fields and earlier
   steps (numbers, + − × ÷, brackets; parsed safely, never eval'd); one step is the purchase quantity.
   The three defaults (created automatically, editable) reproduce the original rules:
   - SEQUENCE: `CD = TOTAL / seqPerCd`, `ROLLS = CD / cdPerRoll` (purchase)
   - BEAD: `KG = TOTAL / pcsPerKg` (purchase)
   - CORD (unit MTR): `GRAMS = TOTAL * denier / 9000`, `KG = GRAMS / 1000` (purchase)
   Materials store their values in `rules: { <fieldKey>: number }`; a category in use cannot be removed.
4. A missing rule is reported, not crashed: "Material conversion rule is not configured." /
   "Please configure Cord Denier before calculating Cord KG."
5. Use `decimal.js` for all of it; send numbers to the client as strings; display rounded to 2 decimals.

The four FRD validation messages (use exactly, keep them in `shared/`):

- `Consumption master not available for this Design + Component + Size.`
- `Please enter a valid Order Quantity.` (prefixed with the row, e.g. `KALI 18: …`, when it is a row)
- `Material conversion rule is not configured.`
- `Please configure Cord Denier before calculating Cord KG.`

**Reference data:** `fixture-26-49.json` (in this folder) holds the 11 materials, design 26-49
(KALI 12 sizes, BLOUSE 12, GALISH 12, BELT ALL), the 37-line order from MATRIAL.xlsx and the
expected results. The engine MUST reproduce them, e.g. 3-MM Sequence 8,861,475 PCS → 280.43 CD →
1.34 rolls; 2.5-MM Bead 1,535,710 PCS → 21.94 KG; Cord 289,206.5 MTR × 1200 denier → 38.56 KG.

---

## 5b. Material costing (decided 2026-10-11, Admin only: permission COST_VIEW)

- Admin sets per material (or per colour, key `CODE|COLOUR`) a **basic rate per purchase unit** and **GST %**
  (Material Master → Rates & costs). A colour without its own rate uses its material's rate.
- Rate incl. GST = basic × (1 + GST ÷ 100). **Cost per consumption unit** = the category formula run with
  `TOTAL = 1` (purchase units in one piece/metre) × rate incl. GST. E.g. 2 MM bead ₹900 + 12% = ₹1,008/KG,
  80,000 pcs/KG → ₹0.0126 per bead. decimal.js throughout; no rounding before display.
- Design cost per piece (per component and size) = Σ quantity per piece × cost per unit, at today's rates.
- Each order saves the cost per unit of every column it uses when it is created (`order.unitCosts`), so
  later rate changes do not change its cost. Older orders without saved rates use today's rates (flagged).
- Material cost is kept separate from labour/punching charges (not modelled yet).

## 5c. Material types chosen per order (decided 2026-10-12)

- A category can have **types** (Admin, Material Master → Categories), e.g. Sequence: PURE GLASS, COLOR GLASS,
  OPQ, METAL, MATT, SPARKLE. Each type has its own **rate per purchase unit + GST** (Rates & costs), shared by
  every size: cost per sequence = type rate incl. GST ÷ (CD per roll × seq per CD).
- **Punching** enters only size + colour + quantity; a colour is compulsory for materials of a typed category.
- **Production** chooses the type for each typed colour **per order** (`order.types`: "SEQ-3MM|PINK" → "MATT");
  required when creating or editing an order. Other orders and the design are not affected.
- Procurement Planning and costing use the order's type (key `SEQ-3MM|PINK^MATT`), so each finish is bought
  and priced separately. Orders are editable (party, date, quantities, types; not the design).

## 6. Screens and behaviour (final)

Sidebar shows only pages the user may open; the first one is their landing page.

**Punching**
- *Designs list*: search by design number (ignore case, spaces and dashes: "2649" finds "26-49");
  each row shows product and component tags like `KALI · 12`. Button "+ New design".
- *New design* dialog: Design Number + Product Name → opens the design with "Add component".
- *Design page*: one card per component (its sizes, Stitch, Laser, consumption per piece — only
  material columns that are used). "+ Add component" / "+ Add Another Component", Edit / Remove per
  component, "Edit product name".
- *Component editor*: component name (suggest FROCK, KALI, BLOUSE, BELT, GALISH; cannot add a
  component the design already has) + a grid: one row per size with Size, Stitch, Laser (optional)
  and one input per material. "+ Add size", remove row. Blank = 0. Saving replaces the component's sizes.

**Production**
- *Design search* (Production's home): search box, Enter opens a single match; table of designs
  (product, rows, previous order count). Only designs with ≥1 component are listed.
- *Design page*: "Previous orders" (Design No., Party, Order Quantity or "Per row", total pieces,
  status, date) + "Punching details" (read-only) + "+ Create New Order".
- *New order dialog*: Party (suggest previous parties), Order date (default today), and a
  two-option switch:
  - **Same for all rows** — one Order Quantity, used for every component + size.
  - **Different per row** — Order Quantity is disabled; a table grouped by component, one quantity
    per size, plus "Fill all sizes" per component (only if it has >1 size). Blank/0 = not ordered.
  - Footer shows "N of M rows · X pieces"; Create disabled until something is ordered.
- *All orders*: #, Design, Item, Party, Date, Order Quantity, Total pieces, Status.
- *Order page*: requirement per row (consumption × qty, only used materials, totals row), status
  dropdown (Pending → In progress → Completed / Cancelled), link to the design.

**Purchase Requirements** (Production + Admin)
- Filters panel: order search (design no., party or order #) → selected order bar with "✕ Clear
  order" → component tick-chips (none ticked = all components). Display filters: category
  (All / Sequence / Beads & decorative / Cord), "Only materials with a requirement" (default ON),
  "Find material". "Reset all filters".
- No order selected = all orders combined **except CANCELLED**.
- Summary cards: Sequence rolls (sum), Beads & decorative KG (sum), Cord KG + MTR.
- Section "Sequence Material Requirements" (Required PCS, CD muted, **Purchase · Rolls** emphasised),
  "Beads & Decorative Materials" (Required PCS, **Purchase · KG**), "Cord Requirement" (Total MTR,
  Denier, **Purchase quantity KG** + grams). Formulas only as small badges.
- Selected order: a foldable "Punched details" panel for the ticked components.
- While new figures load, keep the old ones visible but dimmed.

**Admin**
- *Users*: list with status; accounts waiting for activation listed on top ("Review"); create/edit
  (name, department, role, active, new password).
- *Roles & permissions*: matrix (permissions grouped by area × roles), checkboxes, Save per role; add role.
- *Departments*: list + add.
- *Material Master*: list (#, code, name, category, unit, rule); add/edit (code fixed after create;
  rule fields depend on category and are required; > 0); remove only if no design and no order uses it.
  The material list IS the set of consumption columns everywhere.

**Auth pages**: Login, Sign up, Forgot password (shows a "Reset now" link in development), Reset password.
After an explicit logout, the next login lands on the user's home page (not the previous user's page);
after a session expiry, the user returns to the page they were on.

---

## 7. Mistakes from version 1 — do these right from the start

1. **Data model churn.** V1 changed Name → Component, added Design as a parent, moved Product Name,
   and changed order quantity rules mid-way — four migrations. → Use the final model in §4 from day one.
2. **No git until the end.** → Git + GitHub is step 1; work on `dev_vidhi`, `main` is production.
3. **Forgotten local DB password / secrets.** → Atlas connection string only in `server/.env`
   (git-ignored); commit `server/.env.example` with placeholders.
4. **Server crashed on bad input** (Express 4 + no validation). → Express 5 + a Zod schema on every
   route body/params/query + a global error handler from the first endpoint.
5. **Mid-project restructure** (single backend folder → monorepo, then layered modules). → Start with
   the structure in step 2.
6. **Built screens that were then removed** (Material Requirement page, flat Punching grid, order
   dropdown). → Build only the screens in §6.
7. **Ambiguous requirements decided late** (what Order Quantity means, "Sketch"/"Weight"). → Settled:
   Stitch (required) + Laser (optional) only; order quantity is "same for all" or "per row".
8. **Past orders changed when Punching edited consumption**, and sizes couldn't be deleted because
   orders pointed at them. → Decided in §8: orders follow the design; removing a size or component
   that an order uses is refused with a clear message.
9. **Logout bug**: the next user was sent to the previous user's last page. → See §6 Auth pages.
10. **Windows dev quirk**: Vite sometimes serves a half-saved file ("does not provide an export
    named …"). → Not a code bug; hard-refresh (Ctrl+Shift+R) or restart `vite`.

## 8. Decision (2026-10-08): orders follow the design (no consumption snapshot)

Order lines store only component, size and quantity. Order summaries and purchase requirements are
always calculated from the design's **current** consumption. Effects:
- Editing consumption in the Punching Master changes the figures of existing orders too.
- A size or component used by any order cannot be removed (409, naming the order). Its consumption
  can still be edited.
- Materials used by any design cannot be removed.
- A line whose component + size is missing from the design is reported with the FRD message
  "Consumption master not available …", never a crash.
