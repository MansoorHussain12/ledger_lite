import { Router } from "express";
import { db } from "@workspace/db";
import { cashbookEntriesTable, expensesTable } from "@workspace/db/schema";
import { and, between, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d);
}

const paymentModes = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;
const entryTypes = ["cash_in", "cash_out"] as const;
const sources = ["manual", "opening_balance", "adjustment", "salary", "transfer"] as const;

// ── GET /cashbook ─────────────────────────────────────────────────────────────

router.get("/cashbook", async (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  const modeFilter = req.query.paymentMode as string | undefined;

  const conditions = [];
  if (from) conditions.push(gte(cashbookEntriesTable.date, from));
  if (to) conditions.push(lte(cashbookEntriesTable.date, to));
  if (typeFilter) conditions.push(eq(cashbookEntriesTable.type, typeFilter));
  if (modeFilter) conditions.push(eq(cashbookEntriesTable.paymentMode, modeFilter));

  const rows = await db
    .select()
    .from(cashbookEntriesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(cashbookEntriesTable.date, cashbookEntriesTable.id);

  // compute running balance
  let running = 0;
  const entries = rows.map((r) => {
    const amt = parseFloat(r.amount);
    running += r.type === "cash_in" ? amt : -amt;
    return {
      id: r.id,
      date: toDateStr(r.date),
      type: r.type,
      source: r.source,
      referenceId: r.referenceId ?? null,
      description: r.description,
      paymentMode: r.paymentMode,
      amount: amt,
      runningBalance: Math.round(running * 100) / 100,
      notes: r.notes ?? null,
      createdAt: r.createdAt,
    };
  });

  const totalIn = entries.reduce((s, e) => (e.type === "cash_in" ? s + e.amount : s), 0);
  const totalOut = entries.reduce((s, e) => (e.type === "cash_out" ? s + e.amount : s), 0);

  res.json({ entries, totalIn, totalOut, netBalance: totalIn - totalOut });
});

// ── GET /cashbook/summary ─────────────────────────────────────────────────────

router.get("/cashbook/summary", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db.select().from(cashbookEntriesTable);

  const balanceByMode: Record<string, number> = {};
  let todayIn = 0;
  let todayOut = 0;

  for (const r of rows) {
    const amt = parseFloat(r.amount);
    const sign = r.type === "cash_in" ? 1 : -1;
    const mode = r.paymentMode;
    balanceByMode[mode] = (balanceByMode[mode] ?? 0) + sign * amt;
    const d = toDateStr(r.date);
    if (d === today) {
      if (r.type === "cash_in") todayIn += amt;
      else todayOut += amt;
    }
  }

  res.json({
    cashInHand: Math.round((balanceByMode["cash"] ?? 0) * 100) / 100,
    bankBalance: Math.round((balanceByMode["bank"] ?? 0) * 100) / 100,
    easypaisaBalance: Math.round((balanceByMode["easypaisa"] ?? 0) * 100) / 100,
    jazzcashBalance: Math.round((balanceByMode["jazzcash"] ?? 0) * 100) / 100,
    totalBalance: Math.round(Object.values(balanceByMode).reduce((s, v) => s + v, 0) * 100) / 100,
    todayIn: Math.round(todayIn * 100) / 100,
    todayOut: Math.round(todayOut * 100) / 100,
  });
});

// ── POST /cashbook ────────────────────────────────────────────────────────────

const entryInputSchema = z.object({
  date: z.string().min(1),
  type: z.enum(entryTypes),
  source: z.enum(sources).optional().default("manual"),
  description: z.string().min(1),
  paymentMode: z.enum(paymentModes),
  amount: z.coerce.number().positive(),
  notes: z.string().optional(),
});

router.post("/cashbook", async (req, res) => {
  const parsed = entryInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const userId = (req.session as any)?.userId ?? null;

  const [entry] = await db
    .insert(cashbookEntriesTable)
    .values({
      date: data.date,
      type: data.type,
      source: data.source,
      description: data.description,
      paymentMode: data.paymentMode,
      amount: String(data.amount),
      notes: data.notes ?? null,
      createdById: userId,
    })
    .returning();

  res.status(201).json({
    ...entry,
    date: toDateStr(entry.date),
    amount: parseFloat(entry.amount),
    runningBalance: 0,
  });
});

// ── DELETE /cashbook/:id ──────────────────────────────────────────────────────

router.delete("/cashbook/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(cashbookEntriesTable)
    .where(eq(cashbookEntriesTable.id, id));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.source !== "manual" && existing.source !== "opening_balance" && existing.source !== "adjustment" && existing.source !== "salary" && existing.source !== "transfer") {
    res.status(400).json({ error: "Cannot delete auto-generated entries. Delete from the source module." });
    return;
  }

  await db.delete(cashbookEntriesTable).where(eq(cashbookEntriesTable.id, id));
  res.status(204).send();
});

// ── GET /expenses ─────────────────────────────────────────────────────────────

router.get("/expenses", async (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const category = req.query.category as string | undefined;

  const conditions = [];
  if (from) conditions.push(gte(expensesTable.date, from));
  if (to) conditions.push(lte(expensesTable.date, to));
  if (category) conditions.push(eq(expensesTable.category, category));

  const rows = await db
    .select()
    .from(expensesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expensesTable.date), desc(expensesTable.id));

  res.json(
    rows.map((r) => ({
      ...r,
      date: toDateStr(r.date),
      amount: parseFloat(r.amount),
    }))
  );
});

// ── POST /expenses ────────────────────────────────────────────────────────────

const expenseInputSchema = z.object({
  date: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  paymentMode: z.enum(paymentModes),
  notes: z.string().optional(),
});

router.post("/expenses", async (req, res) => {
  const parsed = expenseInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const userId = (req.session as any)?.userId ?? null;

  // Insert expense + cashbook entry in a transaction
  const result = await db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expensesTable)
      .values({
        date: data.date,
        category: data.category,
        description: data.description,
        amount: String(data.amount),
        paymentMode: data.paymentMode,
        notes: data.notes ?? null,
        createdById: userId,
      })
      .returning();

    await tx.insert(cashbookEntriesTable).values({
      date: data.date,
      type: "cash_out",
      source: "expense",
      referenceId: expense.id,
      description: `${data.category}: ${data.description}`,
      paymentMode: data.paymentMode,
      amount: String(data.amount),
      notes: data.notes ?? null,
      createdById: userId,
    });

    return expense;
  });

  res.status(201).json({
    ...result,
    date: toDateStr(result.date),
    amount: parseFloat(result.amount),
  });
});

// ── DELETE /expenses/:id ──────────────────────────────────────────────────────

router.delete("/expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.transaction(async (tx) => {
    await tx
      .delete(cashbookEntriesTable)
      .where(and(eq(cashbookEntriesTable.source, "expense"), eq(cashbookEntriesTable.referenceId, id)));
    await tx.delete(expensesTable).where(eq(expensesTable.id, id));
  });

  res.status(204).send();
});

export default router;
