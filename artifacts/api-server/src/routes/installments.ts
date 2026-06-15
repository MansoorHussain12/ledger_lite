import { Router } from "express";
import { db } from "@workspace/db";
import {
  installmentPlansTable,
  installmentScheduleTable,
  installmentPaymentsTable,
  customersTable,
  saleOrdersTable,
} from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const today = () => new Date().toISOString().slice(0, 10);

// helper — generate due dates from start_date + frequency + count
function genDueDates(startDate: string, count: number, frequency: string): string[] {
  const dates: string[] = [];
  const d = new Date(startDate);
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      if (frequency === "weekly") d.setDate(d.getDate() + 7);
      else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
      else d.setMonth(d.getMonth() + 1); // monthly (default)
    }
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// helper — build full plan detail (schedule + payments + derived status)
async function buildPlanDetail(planId: number) {
  const [plan] = await db.select().from(installmentPlansTable).where(eq(installmentPlansTable.id, planId));
  if (!plan) return null;

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, plan.customerId));
  let saleOrder = null;
  if (plan.saleOrderId) {
    const [so] = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, plan.saleOrderId));
    saleOrder = so ?? null;
  }

  const schedule = await db.select().from(installmentScheduleTable)
    .where(eq(installmentScheduleTable.planId, planId))
    .orderBy(installmentScheduleTable.installmentNo);

  const payments = await db.select().from(installmentPaymentsTable)
    .where(eq(installmentPaymentsTable.planId, planId))
    .orderBy(installmentPaymentsTable.date);

  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalAmount = parseFloat(plan.totalAmount);
  const downPayment = parseFloat(plan.downPayment);
  const outstanding = Math.max(0, totalAmount - downPayment - totalPaid);
  const isFullyPaid = outstanding <= 0;

  // Per-schedule-item: allocate payments in order
  let remainingPaid = totalPaid;
  const todayStr = today();
  const scheduleWithStatus = schedule.map(s => {
    const amt = parseFloat(s.scheduledAmount);
    const paidForThis = Math.min(remainingPaid, amt);
    remainingPaid = Math.max(0, remainingPaid - amt);
    const isOverdue = !isFullyPaid && s.dueDate < todayStr && paidForThis < amt;
    return {
      id: s.id, planId: s.planId,
      installmentNo: s.installmentNo,
      dueDate: s.dueDate,
      scheduledAmount: amt,
      paidAmount: Math.round(paidForThis * 100) / 100,
      balance: Math.round((amt - paidForThis) * 100) / 100,
      status: paidForThis >= amt ? "paid" as const
        : isOverdue ? "overdue" as const
          : "pending" as const,
    };
  });

  const overdueCount = scheduleWithStatus.filter(s => s.status === "overdue").length;
  const nextDue = scheduleWithStatus.find(s => s.status === "pending" || s.status === "overdue");

  return {
    id: plan.id,
    customerId: plan.customerId,
    customerName: customer?.name ?? "Unknown",
    saleOrderId: plan.saleOrderId ?? null,
    saleOrderRef: saleOrder ? `SO-${String(saleOrder.id).padStart(4, "0")}` : null,
    title: plan.title,
    totalAmount,
    downPayment,
    installmentsCount: plan.installmentsCount,
    frequency: plan.frequency,
    startDate: plan.startDate,
    notes: plan.notes ?? null,
    createdAt: plan.createdAt,
    totalPaid: Math.round(totalPaid * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    isFullyPaid,
    overdueCount,
    nextDueDate: nextDue?.dueDate ?? null,
    nextDueAmount: nextDue?.scheduledAmount ?? null,
    status: isFullyPaid ? "paid" as const
      : overdueCount > 0 ? "overdue" as const
        : "active" as const,
    schedule: scheduleWithStatus,
    payments: payments.map(p => ({
      id: p.id, planId: p.planId, scheduleId: p.scheduleId ?? null,
      date: p.date, amount: parseFloat(p.amount),
      paymentMode: p.paymentMode, notes: p.notes ?? null, createdAt: p.createdAt,
    })),
  };
}

// ── GET /installments ─────────────────────────────────────────────────────────

router.get("/installments", requireAuth, async (_req, res) => {
  const plans = await db.select().from(installmentPlansTable).orderBy(installmentPlansTable.createdAt);
  const rows = await Promise.all(plans.map(p => buildPlanDetail(p.id)));
  res.json(rows.filter(Boolean));
});

// ── POST /installments ────────────────────────────────────────────────────────

const createPlanSchema = z.object({
  customerId: z.number().int().positive(),
  saleOrderId: z.number().int().positive().optional(),
  title: z.string().min(1),
  totalAmount: z.number().positive(),
  downPayment: z.number().min(0).default(0),
  installmentsCount: z.number().int().min(1).max(120),
  frequency: z.enum(["weekly", "biweekly", "monthly"]).default("monthly"),
  startDate: z.string().min(1),
  notes: z.string().optional(),
  customSchedule: z.array(z.object({
    dueDate: z.string(),
    scheduledAmount: z.number().positive(),
  })).optional(),
});

router.post("/installments", requireAuth, async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const d = parsed.data;
  const amountPerInstallment = Math.round(((d.totalAmount - d.downPayment) / d.installmentsCount) * 100) / 100;

  const [plan] = await db.insert(installmentPlansTable).values({
    customerId: d.customerId,
    saleOrderId: d.saleOrderId ?? null,
    title: d.title,
    totalAmount: String(d.totalAmount),
    downPayment: String(d.downPayment),
    installmentsCount: d.installmentsCount,
    frequency: d.frequency,
    startDate: d.startDate,
    notes: d.notes ?? null,
  }).returning();

  // Generate schedule
  if (d.customSchedule && d.customSchedule.length > 0) {
    await db.insert(installmentScheduleTable).values(
      d.customSchedule.map((s, i) => ({
        planId: plan.id, installmentNo: i + 1,
        dueDate: s.dueDate, scheduledAmount: String(s.scheduledAmount),
      }))
    );
  } else {
    const dueDates = genDueDates(d.startDate, d.installmentsCount, d.frequency);
    await db.insert(installmentScheduleTable).values(
      dueDates.map((date, i) => ({
        planId: plan.id, installmentNo: i + 1,
        dueDate: date, scheduledAmount: String(amountPerInstallment),
      }))
    );
  }

  const detail = await buildPlanDetail(plan.id);
  res.status(201).json(detail);
});

// ── GET /installments/:id ─────────────────────────────────────────────────────

router.get("/installments/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const detail = await buildPlanDetail(id);
  if (!detail) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(detail);
});

// ── DELETE /installments/:id ──────────────────────────────────────────────────

router.delete("/installments/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(installmentPlansTable).where(eq(installmentPlansTable.id, id));
  res.status(204).send();
});

// ── POST /installments/:id/payments ──────────────────────────────────────────

const paymentSchema = z.object({
  scheduleId: z.number().int().positive().optional(),
  date: z.string().min(1),
  amount: z.number().positive(),
  paymentMode: z.enum(["cash", "bank_transfer", "cheque", "online"]).default("cash"),
  notes: z.string().optional(),
});

router.post("/installments/:id/payments", requireAuth, async (req, res) => {
  const planId = parseInt(String(req.params.id), 10);
  if (isNaN(planId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed" }); return; }
  const userId = (req.session as any)?.userId ?? null;
  await db.insert(installmentPaymentsTable).values({
    planId,
    scheduleId: parsed.data.scheduleId ?? null,
    date: parsed.data.date,
    amount: String(parsed.data.amount),
    paymentMode: parsed.data.paymentMode,
    notes: parsed.data.notes ?? null,
    createdById: userId,
  });
  const detail = await buildPlanDetail(planId);
  res.status(201).json(detail);
});

// ── DELETE /installments/payments/:paymentId ──────────────────────────────────

router.delete("/installments/payments/:paymentId", requireAuth, async (req, res) => {
  const paymentId = parseInt(String(req.params.paymentId), 10);
  if (isNaN(paymentId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [p] = await db.select().from(installmentPaymentsTable).where(eq(installmentPaymentsTable.id, paymentId));
  if (!p) { res.status(404).json({ error: "Payment not found" }); return; }
  await db.delete(installmentPaymentsTable).where(eq(installmentPaymentsTable.id, paymentId));
  const detail = await buildPlanDetail(p.planId);
  res.status(200).json(detail);
});

export default router;
