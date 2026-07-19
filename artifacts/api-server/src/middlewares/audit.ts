import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

type Action = "create" | "update" | "delete";

const ACTION_BY_METHOD: Record<string, Action> = {
  POST: "create",
  PATCH: "update",
  PUT: "update",
  DELETE: "delete",
};

// Most-specific first, first match wins — several routes share a top path
// segment for different sub-resources (e.g. /cashbook vs /expenses both
// live in cashbook.ts; /installments/:id/payments vs /installments/:id).
const ENTITY_TYPE_RULES: Array<[RegExp, string]> = [
  [/^\/installments\/\d+\/payments(\/|$)/, "installment payment"],
  [/^\/installments\/payments(\/|$)/, "installment payment"],
  [/^\/installments(\/|$)/, "installment"],
  [/^\/inventory\/adjustments(\/|$)/, "stock adjustment"],
  [/^\/inventory(\/|$)/, "inventory"],
  [/^\/purchases(\/|$)/, "purchase invoice"],
  [/^\/suppliers(\/|$)/, "supplier"],
  [/^\/customers(\/|$)/, "customer"],
  [/^\/products(\/|$)/, "product"],
  [/^\/sale-orders(\/|$)/, "sale order"],
  [/^\/payments(\/|$)/, "payment"],
  [/^\/cashbook(\/|$)/, "cashbook entry"],
  [/^\/expenses(\/|$)/, "expense"],
  [/^\/lookups(\/|$)/, "lookup value"],
  [/^\/users(\/|$)/, "user"],
  [/^\/settings(\/|$)/, "settings"],
];

// POST /installments/:id/payments never returns the new payment's own id
// (no .returning() on that insert) — its response body's `.id` resolves to
// the *plan's* id instead, so the generic "Created X #id" phrasing would be
// misleading. Checked before the generic builder.
const DESCRIPTION_OVERRIDES: Array<[string, RegExp, (id: number | null) => string]> = [
  ["POST", /^\/installments\/\d+\/payments$/, (id) => `Added a payment to installment #${id}`],
];

function resolveEntityType(apiPath: string): string | null {
  for (const [pattern, label] of ENTITY_TYPE_RULES) {
    if (pattern.test(apiPath)) return label;
  }
  return null;
}

// POST: the new row's id lives in the response body, never the URL.
// PATCH/PUT/DELETE: from req.params — but param names aren't consistent
// across routes (:id, :productId, :paymentId), and /lookups/:type/:id has
// a non-numeric :type that must be skipped, so scan values rather than
// assume a key name.
function resolveEntityId(
  method: string,
  params: Record<string, string | string[] | undefined>,
  body: unknown,
): number | null {
  if (method === "POST") {
    if (body && typeof body === "object" && "id" in body) {
      const id = (body as Record<string, unknown>).id;
      return typeof id === "number" ? id : null;
    }
    return null;
  }
  const values = Object.values(params).flat();
  for (let i = values.length - 1; i >= 0; i--) {
    const n = Number(values[i]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function buildDescription(
  method: string,
  apiPath: string,
  action: Action,
  entityType: string,
  entityId: number | null,
): string {
  for (const [overrideMethod, pattern, build] of DESCRIPTION_OVERRIDES) {
    if (method === overrideMethod && pattern.test(apiPath)) return build(entityId);
  }
  const verb = action === "create" ? "Created" : action === "update" ? "Updated" : "Deleted";
  const suffix = entityId != null ? ` #${entityId}` : "";
  return `${verb} ${entityType}${suffix}`;
}

/**
 * Records a row in audit_logs for every successful (2xx) mutating request
 * to a recognized business-data route. Deliberately excludes /auth/* (login
 * /logout are session events, not data mutations) and anything that fails
 * (a failed request didn't change anything — pino already logs failures).
 */
export function auditLog(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api/") || !MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const apiPath = req.path.slice(4); // strip leading "/api"
  if (apiPath.startsWith("/auth")) {
    next();
    return;
  }

  const entityType = resolveEntityType(apiPath);
  if (!entityType) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    res.locals.auditResponseBody = body;
    return originalJson(body);
  }) as Response["json"];

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    const action = ACTION_BY_METHOD[req.method];
    if (!action) return;

    const entityId = resolveEntityId(req.method, req.params, res.locals.auditResponseBody);
    const description = buildDescription(req.method, apiPath, action, entityType, entityId);
    const userId = req.session.userId ?? null;

    void (async () => {
      try {
        let userName: string | null = null;
        if (userId != null) {
          const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
          userName = u?.name ?? null;
        }
        await db.insert(auditLogsTable).values({
          userId,
          userName,
          method: req.method,
          path: req.path,
          entityType,
          entityId,
          action,
          description,
        });
      } catch (err) {
        logger.warn({ err }, "Failed to write audit log");
      }
    })();
  });

  next();
}
