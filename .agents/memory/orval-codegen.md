---
name: Orval codegen config for this project
description: How to correctly run orval codegen without stale index.ts or mode conflicts
---

## Rule
The `zod` output block in `lib/api-spec/orval.config.ts` must have:
- `mode: "single"` (not "split")
- `indexFiles: false` (prevents orval regenerating index.ts)
- No `schemas` option

`lib/api-zod/src/index.ts` must only contain: `export * from "./generated/api";`

After any codegen run, verify `index.ts` is not overwritten with a stale `./generated/types` reference.

**Why:** When `mode: "split"` was used alongside a `schemas` option, orval generated both `generated/api.ts` (Zod schemas) and `generated/types/` (TS types), and regenerated `index.ts` to re-export both. Removing the `schemas` option and switching to `mode: "single"` removes the types directory, but orval still regenerated `index.ts` with the stale types export. `indexFiles: false` prevents this entirely.

**How to apply:** If codegen fails with "Cannot find module './generated/types'", manually set `lib/api-zod/src/index.ts` to `export * from "./generated/api";` and re-run. Ensure `indexFiles: false` is set to prevent recurrence.
