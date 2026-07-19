import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/audit-logs", requireRole("owner"), async (req, res): Promise<void> => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const userId = req.query.userId ? Number(req.query.userId) : undefined;
  const action = req.query.action as "create" | "update" | "delete" | undefined;
  const entityType = req.query.entityType as string | undefined;

  const conditions = [];
  if (from) conditions.push(gte(auditLogsTable.createdAt, new Date(`${from}T00:00:00.000Z`)));
  if (to) conditions.push(lte(auditLogsTable.createdAt, new Date(`${to}T23:59:59.999Z`)));
  if (userId) conditions.push(eq(auditLogsTable.userId, userId));
  if (action) conditions.push(eq(auditLogsTable.action, action));
  if (entityType) conditions.push(eq(auditLogsTable.entityType, entityType));

  const rows = await db.select().from(auditLogsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(1000);

  res.json(rows);
});

export default router;
