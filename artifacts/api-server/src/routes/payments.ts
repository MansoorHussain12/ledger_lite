import { Router, type IRouter } from "express";
import { db, paymentsTable, customersTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  ListPaymentsQueryParams,
  CreatePaymentBody,
  GetPaymentParams,
  UpdatePaymentParams,
  UpdatePaymentBody,
  DeletePaymentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const query = ListPaymentsQueryParams.safeParse(req.query);
  const conditions = [];
  if (query.success) {
    if (query.data.customerId) conditions.push(eq(paymentsTable.customerId, query.data.customerId));
    if (query.data.from) conditions.push(gte(paymentsTable.date, String(query.data.from)));
    if (query.data.to) conditions.push(lte(paymentsTable.date, String(query.data.to)));
    if (query.data.type) conditions.push(eq(paymentsTable.type, query.data.type as "cash" | "bank"));
  }
  const rows = await db.select().from(paymentsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(paymentsTable.date));
  const result = await Promise.all(rows.map(async (p) => {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
    return {
      id: p.id, customerId: p.customerId, customerName: c?.name ?? "",
      date: p.date, type: p.type, amount: parseFloat(p.amount),
      bankAccount: p.bankAccount ?? null, chequeNo: p.chequeNo ?? null, notes: p.notes ?? null, createdAt: p.createdAt,
    };
  }));
  res.json(result);
});

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { customerId, date, type, amount, bankAccount, chequeNo, notes } = parsed.data;
  const [p] = await db.insert(paymentsTable).values({
    customerId, date: String(date), type, amount: String(amount),
    bankAccount: bankAccount ?? null, chequeNo: chequeNo ?? null, notes: notes ?? null,
  }).returning();
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
  res.status(201).json({
    id: p.id, customerId: p.customerId, customerName: c?.name ?? "",
    date: p.date, type: p.type, amount: parseFloat(p.amount),
    bankAccount: p.bankAccount ?? null, chequeNo: p.chequeNo ?? null, notes: p.notes ?? null, createdAt: p.createdAt,
  });
});

router.get("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [p] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!p) { res.status(404).json({ error: "Payment not found" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
  res.json({
    id: p.id, customerId: p.customerId, customerName: c?.name ?? "",
    date: p.date, type: p.type, amount: parseFloat(p.amount),
    bankAccount: p.bankAccount ?? null, chequeNo: p.chequeNo ?? null, notes: p.notes ?? null, createdAt: p.createdAt,
  });
});

router.patch("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdatePaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.date != null) updates.date = parsed.data.date;
  if (parsed.data.type != null) updates.type = parsed.data.type;
  if (parsed.data.amount != null) updates.amount = String(parsed.data.amount);
  if (parsed.data.bankAccount !== undefined) updates.bankAccount = parsed.data.bankAccount ?? null;
  if (parsed.data.chequeNo !== undefined) updates.chequeNo = parsed.data.chequeNo ?? null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
  const [p] = await db.update(paymentsTable).set(updates).where(eq(paymentsTable.id, params.data.id)).returning();
  if (!p) { res.status(404).json({ error: "Payment not found" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
  res.json({
    id: p.id, customerId: p.customerId, customerName: c?.name ?? "",
    date: p.date, type: p.type, amount: parseFloat(p.amount),
    bankAccount: p.bankAccount ?? null, chequeNo: p.chequeNo ?? null, notes: p.notes ?? null, createdAt: p.createdAt,
  });
});

router.delete("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeletePaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
