# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AL-RAHMAN TRADERS ERP — a full-featured ERP for a cement wholesale business: cashbook, sales ledger, purchases & suppliers, inventory, and reports.

## Commands

- `pnpm run dev` — run **both** the API server and frontend together (via `concurrently`, labeled/colored output), the normal way to run the app locally
- `pnpm run setup:local` — one-shot local DB setup: pushes the Drizzle schema non-interactively and creates the `admin`/`admin123` login if it doesn't exist yet. Safe to re-run (idempotent).
- `pnpm --filter @workspace/api-server run dev` — run just the API server (builds then starts, port from `PORT` env)
- `pnpm --filter @workspace/ledger run dev` — run just the frontend dev server
- `pnpm run typecheck` — full typecheck across all packages (libs via `tsc --build`, then artifacts + scripts)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate `@workspace/api-client-react` and `@workspace/api-zod` from the OpenAPI spec (also re-runs `typecheck:libs`)
- `pnpm --filter @workspace/db run push` — push DB schema changes interactively (prompts to confirm each change); `pnpm --filter @workspace/db run push-force` skips the prompts (what `setup:local` uses — fine for local dev, don't use `--force` against a shared/production DB)
- Env vars are read from gitignored `.env` files per package (`artifacts/api-server/.env`, `artifacts/ledger/.env`) via `dotenv/config` — see "Running locally" below.
- **No test suite exists in this repo.** Typecheck is the only automated correctness gate — always run `pnpm run typecheck` before considering a change done.
- Use `pnpm`, not `npm`/`yarn` — the root `preinstall` script hard-fails otherwise.

## Running locally

All of this works from a plain Windows `cmd.exe` (or PowerShell, or a POSIX shell) — no bash-only syntax anywhere in the scripts.

1. **Prerequisites**: Node 24, pnpm ≥ 9.5 (older pnpm can't resolve the `catalog:` protocol used throughout this workspace's `package.json` files — see Gotchas), and a running local PostgreSQL instance with a database created (e.g. `ledger_lite`).
2. **Install dependencies**: `pnpm install` from the repo root. On a fresh install, pnpm may pause with `ERR_PNPM_IGNORED_BUILDS`; run `pnpm approve-builds --all`, then `pnpm install` again.
3. **Configure env vars** — two `.env` files, both gitignored, each loaded automatically (no manual `export`/`set`/`$env:` needed):
   - `artifacts/api-server/.env`:
     ```
     DATABASE_URL=postgresql://<user>:<password>@localhost:5432/ledger_lite
     SESSION_SECRET=<any random string>
     PORT=8080
     ```
   - `artifacts/ledger/.env`:
     ```
     PORT=5173
     BASE_PATH=/
     API_PORT=8080
     ```
   This is the only manual step — everything after this is one command each.
4. **Set up the database**: `pnpm run setup:local` — pushes the schema and creates the `admin`/`admin123` login. No `psql` needed, no interactive prompts.
5. **(Optional) seed sample data**: `psql -d "%DATABASE_URL%" -f scripts/seed.sql` (cmd.exe) or `psql -d "$DATABASE_URL" -f scripts/seed.sql` (bash/PowerShell) — seeds products, customers, suppliers, sale orders, purchases, cashbook/expenses, installments, etc. Creates the `company_settings` table (not Drizzle-managed, see Architecture) and the `admin`/`admin123` login if missing, idempotently — safe to re-run, won't reset branding or invalidate an existing login. Use `-d` explicitly; passing the connection string positionally has been flaky with some local `psql` builds (see Gotchas).
6. **Run it**: `pnpm run dev` — starts the API server (`:8080`) and frontend (`:5173`) together in one terminal.
7. Open `http://localhost:5173` and log in as `admin` / `admin123`.

Verify: `GET http://localhost:8080/api/healthz` returns 200 directly; with both servers running, `/api/...` calls made from the browser should return JSON, not HTML (HTML means the Vite dev proxy in `artifacts/ledger/vite.config.ts` isn't reaching the API server — check `API_PORT` matches where the API server actually listens).

## Production build (single service)

`artifacts/api-server/src/app.ts` serves the built frontend directly — a no-op in local dev (the build output doesn't exist yet), but the whole app becomes one deployable Node process once both sides are built:

```
pnpm --filter @workspace/ledger run build      # → artifacts/ledger/dist/public
pnpm --filter @workspace/api-server run build  # → artifacts/api-server/dist/index.mjs
node artifacts/api-server/dist/index.mjs       # serves both API and UI on $PORT
```

The static/SPA-fallback middleware only excludes `/api/*` (via regex, not a full router mount), so an unmatched API route still 404s as JSON instead of silently returning `index.html`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9 (project references; `tsc --build` at the root builds `lib/db`, `lib/api-client-react`, `lib/api-zod`)
- API: Express 5 at `artifacts/api-server/` (port 8080, mounted under `/api`)
- Frontend: React 19 + Vite at `artifacts/ledger/` (path `/`), shadcn/radix UI components, TanStack Query, wouter for routing, react-hook-form + zod resolvers
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod — `zod/v4` in lib packages, plain `zod` (catalog) in `api-server` routes (these are not interchangeable; see Architecture decisions)
- API codegen: Orval, driven by `lib/api-spec/openapi.yaml` (hand-written, source of truth for API contracts)
- Build: esbuild (CJS/ESM bundle for the API server via `artifacts/api-server/build.mjs`), Vite for the frontend

## Architecture

This is a pnpm workspace monorepo split into `lib/` (shared/generated packages) and `artifacts/` (deployable apps):

- `lib/db` — Drizzle schema and DB client. Schema files live in `lib/db/src/schema/`: `customers`, `products` (+ `product_rates`), `saleOrders` (`sale_orders`, `sale_order_items`), `payments`, `cashbook` (`cashbook_entries`, `expenses`), `purchases` (`suppliers`, `purchase_invoices`, `purchase_invoice_items`), `installments` (EMI plans/schedule/payments), `inventory` (`stock_adjustments`), `lookups` (generic key/value config), `users`. `index.ts` re-exports all tables.
- `lib/api-spec` — `openapi.yaml` is the API contract source of truth; `orval.config.ts` generates two downstream packages via `pnpm codegen`.
- `lib/api-zod` and `lib/api-client-react` — **generated code, do not hand-edit.** Zod request/response schemas and a React Query client (custom fetch mutator, base URL `/api`), regenerated from the OpenAPI spec.
- `artifacts/api-server` — Express 5 API. `src/index.ts` is the entry point (reads `PORT`, calls `ensureSessionTable()`, then listens). `src/app.ts` wires pino-http logging, CORS, body parsing, and session middleware, then mounts the aggregated router at `/api`. `src/routes/index.ts` combines ~14 sub-routers (health, auth, customers, products, saleOrders, payments, reports, dashboard, cashbook, suppliers, inventory, installments, settings, lookups). `src/middlewares/auth.ts` has `requireAuth`/`requireRole(...roles)` guards based on `req.session.userId`/`userRole`. Sessions are Postgres-backed via `connect-pg-simple` (`user_sessions` table).
- `artifacts/ledger` — React frontend. `src/App.tsx` composes `QueryClientProvider` → `TooltipProvider` → wouter router → `AuthProvider` → `CompanyProvider` → the authenticated app shell (login page if unauthenticated). `src/lib/auth.tsx` wraps generated `useGetMe`/`useLogin`/`useLogout` hooks in a context, with logic to avoid clearing the user on transient refetch errors. `src/components/layout.tsx` is the role-based sidebar nav. Pages live one-per-route in `src/pages/`.
- `artifacts/mockup-sandbox` — standalone UI prototyping playground using the same shadcn/radix stack but not wired to the API client; not part of the production app.
- `scripts/` — misc workspace scripts: `seed.sql` (comprehensive sample data — also creates `company_settings` and the admin login, so it's usable standalone via `psql`), `src/setup-db.ts` (the `setup:local` command — pushes schema + creates the local admin login, self-contained via `pg`/`bcryptjs`, no `psql` dependency).

## Architecture decisions

- Against a shared/production DB, prefer `psql` directly (or the interactive `pnpm --filter @workspace/db run push`, confirming each change) over `push-force` — force-pushing skips the confirmation prompt and can silently drop columns/data. For local dev, `push-force` (used by `pnpm run setup:local`) is fine.
- `zod` (not `zod/v4`) must be used in `api-server` routes — add `"zod": "catalog:"` to a package's `package.json` if it's missing.
- Cash purchases/payments auto-post to `cashbook_entries`; deleting a purchase removes the matching cashbook entry.
- Supplier balance = `opening_balance + sum(purchase total_amount) − sum(paid_amount)`.
- Company settings (`company_settings`) is a single-row table accessed via raw pool queries (not the Drizzle query builder elsewhere): GET is public, PUT is owner-only, logo is stored as base64 `TEXT`. It is **not** part of the Drizzle schema (not in `lib/db/src/schema/`) and `pnpm run setup:local`/`push-force` will not create it — `scripts/seed.sql` has a `CREATE TABLE IF NOT EXISTS` for it, so run that at least once against any DB you want the app's settings page to actually work on.
- The products page uses direct `fetch` instead of the generated codegen hooks, specifically to avoid needing an OpenAPI spec regen for that flow.
- API server listens on the `PORT` env var; frontend requests to `/api` are proxied to port 8080.

## Gotchas

- Always restart the API server after any route change — the build step (esbuild) is part of the `dev` script, so a plain restart is required to pick up changes.
- Run `pnpm --filter @workspace/api-spec run codegen` after every OpenAPI spec change to keep `api-client-react`/`api-zod` in sync.
- In `lib/api-spec/orval.config.ts`, the `zod` output block must use `mode: "single"` and `indexFiles: false` with no `schemas` option — otherwise orval regenerates `lib/api-zod/src/index.ts` with a stale `./generated/types` reference and codegen breaks with "Cannot find module './generated/types'". Fix by hand-setting `index.ts` to `export * from "./generated/api";` and re-running.
- The interactive `pnpm --filter @workspace/db run push` requires a TTY and won't work in a non-interactive shell — use `push-force` (or `psql` directly) there instead.
- `pnpm run dev` at the workspace root is intentional (via `concurrently`, defined in the root `package.json`) — it's the normal way to run the app locally. Don't add a second, conflicting root-level dev script.
- If `pnpm install` fails with `ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER` on a `catalog:` specifier, the global pnpm is older than 9.5 (which added the `catalog:` protocol) — upgrade it (`npm install -g pnpm@latest`), don't try to work around it in the repo config.
- If install stops with `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds --all` — newer pnpm requires explicit approval for postinstall scripts (e.g. esbuild's native binary fetch) even when the package is already listed under `onlyBuiltDependencies` in `pnpm-workspace.yaml`.
- `lib/db/drizzle.config.ts`'s `schema` path is built with `.split(path.sep).join("/")` — drizzle-kit globs that path internally and silently matches zero files if it contains Windows backslashes (`path.join` alone produces those on Windows), failing with "No schema files found for path config" even though the file exists. Keep any path passed to drizzle-kit config forward-slashed.
- `import "dotenv/config"` (or an explicit `dotenv.config()` call) must run before any module that reads `process.env` at import time — e.g. `artifacts/api-server/src/index.ts` imports it before `./app`, because `@workspace/db` throws immediately at import time if `DATABASE_URL` is unset. Don't reorder those imports.
- On this environment's `psql` (16.2, invoked from Git Bash), passing the connection string as a bare positional argument breaks flag parsing entirely (`psql "$DATABASE_URL" -c "..."` fails with `extra command-line argument "..." ignored`, even for `-f`/`-c`). Always pass it via `-d`: `psql -d "$DATABASE_URL" -f scripts/seed.sql`.
- `sale_orders.total_amount` and `purchase_invoices.total_amount` are always derived as `sum(item.amount)` by the app (see `saleOrders.ts`/`suppliers.ts`) — any seed/fixture data must keep those in sync manually, since raw SQL inserts bypass that derivation. `scripts/seed.sql` does this deliberately; check it stays consistent if you edit it.
- `app.ts`'s production static-file serving assumes `artifacts/ledger` is a sibling of `artifacts/api-server` (`path.resolve(__dirname, "../../ledger/dist/public")`, resolved relative to the bundled `dist/index.mjs`, not the TS source — works because `build.mjs`'s banner script shims `__dirname` to the bundle's own location). Don't move either package without updating that path.
