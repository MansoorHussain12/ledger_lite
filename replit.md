# AL-RAHMAN TRADERS ERP

A full-featured ERP for a cement wholesale business — cashbook, sales ledger, purchases & suppliers, inventory, and reports.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 at `artifacts/api-server/` (port 8080, path `/api`)
- Frontend: React + Vite at `artifacts/ledger/` (path `/`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4` in lib packages, plain `zod` in api-server routes)
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — DB schema files (customers, products, saleOrders, payments, cashbook, purchases)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/ledger/src/pages/` — React page components
- `artifacts/ledger/src/components/layout.tsx` — sidebar nav (role-based)
- `artifacts/ledger/src/App.tsx` — wouter routing

## Architecture decisions

- DB tables created directly via psql (not drizzle push) because drizzle push needs a TTY
- Cash purchases/payments auto-post to cashbook_entries; delete purchase → removes matching cashbook entry
- Supplier balance = opening_balance + sum(purchase total_amount) − sum(paid_amount)
- `zod` (not `zod/v4`) must be used in `api-server` routes — add `"zod": "catalog:"` to its package.json if needed
- API server listens on `PORT` env var; proxy routes `/api` → port 8080

## Product

- **Cashbook**: Cash in/out ledger with running balance, expenses tab, payment-mode filter
- **Customers & Sales**: Customer ledger, sale orders with line items, payment recording
- **Suppliers & Purchases**: Supplier list with payable balance, purchase invoices with line items, auto-cashbook on cash payment
- **Products**: Product catalog with cost price tracking (updated on purchase)
- **Reports & Dashboard**: Business summary, sale activity

## User preferences

- Admin login: admin / admin123
- Modules planned: Cashbook ✓, Purchases & Suppliers ✓, Daily Profit Reports, Advanced POS, EMI/Installments, Inventory Management

## Gotchas

- Always restart the API server workflow after any route change (build step is part of `dev` script)
- Codegen (`pnpm --filter @workspace/api-spec run codegen`) must be run after every OpenAPI spec change
- `pnpm --filter @workspace/db run push` requires a TTY — use psql directly for schema changes
- Do NOT run `pnpm dev` at workspace root — use `restart_workflow` instead

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
