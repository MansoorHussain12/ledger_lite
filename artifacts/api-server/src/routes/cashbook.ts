import { Router } from "express";
import { db } from "@workspace/db";
import { cashbookEntriesTable, expensesTable } from "@workspace/db/schema";
import { and, between, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";

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

router.get("/cashbook", requireAuth, async (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  const modeFilter = req.query.paymentMode as string | undefined;
  const includeReversed = req.query.includeReversed === "true";

  // Only "live" (posted) entries — a reversed original and its reversal (e.g. from a
  // corrected payment) are both excluded, so this reflects the correction, not the
  // mistake (see the correction workflow). includeReversed reveals the full trail.
  const conditions = includeReversed ? [] : [eq(cashbookEntriesTable.status, "posted")];
  if (from) conditions.push(gte(cashbookEntriesTable.date, from));
  if (to) conditions.push(lte(cashbookEntriesTable.date, to));
  if (typeFilter) conditions.push(eq(cashbookEntriesTable.type, typeFilter));
  if (modeFilter) conditions.push(eq(cashbookEntriesTable.paymentMode, modeFilter));

  const rows = await db
    .select()
    .from(cashbookEntriesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(cashbookEntriesTable.date, cashbookEntriesTable.id);

  // compute running balance — only "live" (posted) rows advance it; a reversed/reversal
  // row shown via includeReversed is audit context, not a real balance movement, so it
  // just carries the running total forward unchanged rather than double-counting.
  let running = 0;
  const entries = rows.map((r) => {
    const amt = parseFloat(r.amount);
    if (r.status === "posted") running += r.type === "cash_in" ? amt : -amt;
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
      status: r.status, reversesId: r.reversesId ?? null, correctsId: r.correctsId ?? null,
    };
  });

  const totalIn = entries.reduce((s, e) => (e.status === "posted" && e.type === "cash_in" ? s + e.amount : s), 0);
  const totalOut = entries.reduce((s, e) => (e.status === "posted" && e.type === "cash_out" ? s + e.amount : s), 0);

  res.json({ entries, totalIn, totalOut, netBalance: totalIn - totalOut });
});

// ── GET /cashbook/summary ─────────────────────────────────────────────────────

router.get("/cashbook/summary", requireAuth, async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db.select().from(cashbookEntriesTable).where(eq(cashbookEntriesTable.status, "posted"));

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

router.post("/cashbook", requireAuth, async (req, res) => {
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

// User-editable sources — the only ones a "Correct" (or, previously, "Delete") action
// may ever touch directly. Auto-generated entries (payment/expense/purchase) must be
// corrected via their source transaction, which cascades into cashbook_entries itself.
const USER_EDITABLE_SOURCES = ["manual", "opening_balance", "adjustment", "salary", "transfer"] as const;

function toCashbookResponse(r: typeof cashbookEntriesTable.$inferSelect) {
  return {
    id: r.id, date: toDateStr(r.date), type: r.type, source: r.source,
    referenceId: r.referenceId ?? null, description: r.description, paymentMode: r.paymentMode,
    amount: parseFloat(r.amount), notes: r.notes ?? null, createdAt: r.createdAt,
    status: r.status, reversesId: r.reversesId ?? null, correctsId: r.correctsId ?? null,
  };
}

// ── POST /cashbook/:id/correct ──────────────────────────────────────────────────
// Correction workflow — see lib/db/src/schema/saleOrders.ts for the full design. A
// posted entry is never edited or deleted in place. Restricted to the same
// user-editable sources the old DELETE guard used — auto-generated entries are
// corrected via their source transaction (Payments/Purchases), not here.

const cashbookCorrectionSchema = z.object({
  void: z.boolean().optional(),
  reason: z.string().optional(),
  date: z.string().min(1).optional(),
  type: z.enum(entryTypes).optional(),
  source: z.enum(sources).optional(),
  description: z.string().min(1).optional(),
  paymentMode: z.enum(paymentModes).optional(),
  amount: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
});

router.post("/cashbook/:id/correct", requireRole("owner"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = cashbookCorrectionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const d = parsed.data;

  const [original] = await db.select().from(cashbookEntriesTable).where(eq(cashbookEntriesTable.id, id));
  if (!original) { res.status(404).json({ error: "Not found" }); return; }
  if (!(USER_EDITABLE_SOURCES as readonly string[]).includes(original.source)) {
    res.status(400).json({ error: "Cannot correct auto-generated entries here. Correct the source transaction instead (Payment/Purchase)." });
    return;
  }
  if (original.status !== "posted") {
    res.status(409).json({ error: `This entry is already ${original.status} — correct its replacement instead, not this row.` });
    return;
  }

  const isVoid = d.void === true;
  if (!isVoid && (d.date == null || d.type == null || d.description == null || d.paymentMode == null || d.amount == null)) {
    res.status(400).json({ error: "date, type, description, paymentMode, and amount are required unless void=true" });
    return;
  }

  const userId = (req.session as any)?.userId ?? null;

  const result = await db.transaction(async (tx) => {
    // Notes carry the submitted correction reason (falling back to the original's own
    // notes if none given) — reversal rows are never shown directly, only surfaced as
    // the "why" behind a correction/void in the history view.
    const [reversal] = await tx.insert(cashbookEntriesTable).values({
      date: original.date, type: original.type, source: original.source, referenceId: original.referenceId,
      description: original.description, paymentMode: original.paymentMode, amount: original.amount,
      notes: d.reason ?? original.notes, createdById: userId, status: "reversal", reversesId: original.id,
    }).returning();

    await tx.update(cashbookEntriesTable).set({ status: "reversed" }).where(eq(cashbookEntriesTable.id, original.id));

    let correctionId: number | null = null;
    if (!isVoid) {
      const [correction] = await tx.insert(cashbookEntriesTable).values({
        date: d.date!, type: d.type!, source: d.source ?? original.source, description: d.description!,
        paymentMode: d.paymentMode!, amount: String(d.amount!), notes: d.notes ?? null, createdById: userId,
        status: "posted", correctsId: original.id,
      }).returning();
      correctionId = correction.id;
    }

    return { reversalId: reversal.id, correctionId };
  });

  const [origEntry] = await db.select().from(cashbookEntriesTable).where(eq(cashbookEntriesTable.id, original.id));
  const [reversalEntry] = await db.select().from(cashbookEntriesTable).where(eq(cashbookEntriesTable.id, result.reversalId));
  const correctionEntry = result.correctionId != null
    ? (await db.select().from(cashbookEntriesTable).where(eq(cashbookEntriesTable.id, result.correctionId)))[0]
    : null;

  res.json({
    original: toCashbookResponse(origEntry),
    reversal: toCashbookResponse(reversalEntry),
    ...(correctionEntry ? { correction: toCashbookResponse(correctionEntry) } : {}),
  });
});

// ── GET /expenses ─────────────────────────────────────────────────────────────

function toExpenseResponse(r: typeof expensesTable.$inferSelect) {
  return {
    id: r.id, date: toDateStr(r.date), category: r.category, description: r.description,
    amount: parseFloat(r.amount), paymentMode: r.paymentMode, notes: r.notes ?? null, createdAt: r.createdAt,
    status: r.status, reversesId: r.reversesId ?? null, correctsId: r.correctsId ?? null,
  };
}

router.get("/expenses", requireAuth, async (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const category = req.query.category as string | undefined;
  const includeReversed = req.query.includeReversed === "true";

  // Default to only "live" (posted) rows — reversed originals and reversal paper-trail
  // rows are excluded unless explicitly asked for (see the correction workflow).
  const conditions = includeReversed ? [] : [eq(expensesTable.status, "posted")];
  if (from) conditions.push(gte(expensesTable.date, from));
  if (to) conditions.push(lte(expensesTable.date, to));
  if (category) conditions.push(eq(expensesTable.category, category));

  const rows = await db
    .select()
    .from(expensesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expensesTable.date), desc(expensesTable.id));

  res.json(rows.map(toExpenseResponse));
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

router.post("/expenses", requireAuth, async (req, res) => {
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

  res.status(201).json(toExpenseResponse(result));
});

// ── POST /expenses/:id/correct ──────────────────────────────────────────────────
// Correction workflow — see lib/db/src/schema/saleOrders.ts for the full design. A
// posted expense is never edited or deleted in place. This either reverses it with no
// replacement (void: true), or reverses it and posts a new corrected expense in its
// place (default) — and in both cases, correctly reverses/reposts the expense's
// auto-posted cashbook entry too, so cashbook balance reflects the correction.

const expenseCorrectionSchema = z.object({
  void: z.boolean().optional(),
  reason: z.string().optional(),
  date: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  amount: z.coerce.number().positive().optional(),
  paymentMode: z.enum(paymentModes).optional(),
  notes: z.string().optional(),
});

router.post("/expenses/:id/correct", requireRole("owner"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = expenseCorrectionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const d = parsed.data;

  const [original] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!original) { res.status(404).json({ error: "Expense not found" }); return; }
  if (original.status !== "posted") {
    res.status(409).json({ error: `This expense is already ${original.status} — correct its replacement instead, not this row.` });
    return;
  }

  const isVoid = d.void === true;
  if (!isVoid && (d.date == null || d.category == null || d.description == null || d.amount == null || d.paymentMode == null)) {
    res.status(400).json({ error: "date, category, description, amount, and paymentMode are required unless void=true" });
    return;
  }

  const userId = (req.session as any)?.userId ?? null;

  const result = await db.transaction(async (tx) => {
    // Notes carry the submitted correction reason (falling back to the original's own
    // notes if none given) — reversal rows are never shown directly, only surfaced as
    // the "why" behind a correction/void in the history view.
    const [reversal] = await tx.insert(expensesTable).values({
      date: original.date, category: original.category, description: original.description,
      amount: original.amount, paymentMode: original.paymentMode, notes: d.reason ?? original.notes,
      createdById: userId, status: "reversal", reversesId: original.id,
    }).returning();

    const [linkedCashbookEntry] = await tx.select().from(cashbookEntriesTable)
      .where(and(eq(cashbookEntriesTable.source, "expense"), eq(cashbookEntriesTable.referenceId, original.id), eq(cashbookEntriesTable.status, "posted")));
    if (linkedCashbookEntry) {
      await tx.insert(cashbookEntriesTable).values({
        date: linkedCashbookEntry.date, type: linkedCashbookEntry.type, source: linkedCashbookEntry.source,
        referenceId: linkedCashbookEntry.referenceId, description: `Reversal: ${linkedCashbookEntry.description}`,
        paymentMode: linkedCashbookEntry.paymentMode, amount: linkedCashbookEntry.amount, notes: linkedCashbookEntry.notes,
        createdById: userId, status: "reversal", reversesId: linkedCashbookEntry.id,
      });
      await tx.update(cashbookEntriesTable).set({ status: "reversed" }).where(eq(cashbookEntriesTable.id, linkedCashbookEntry.id));
    }

    await tx.update(expensesTable).set({ status: "reversed" }).where(eq(expensesTable.id, original.id));

    let correctionId: number | null = null;
    if (!isVoid) {
      const [correction] = await tx.insert(expensesTable).values({
        date: d.date!, category: d.category!, description: d.description!, amount: String(d.amount!),
        paymentMode: d.paymentMode!, notes: d.notes ?? null, createdById: userId,
        status: "posted", correctsId: original.id,
      }).returning();
      await tx.insert(cashbookEntriesTable).values({
        date: d.date!, type: "cash_out", source: "expense", referenceId: correction.id,
        description: `${d.category}: ${d.description}`, paymentMode: d.paymentMode!,
        amount: String(d.amount!), notes: d.notes ?? null, createdById: userId,
      });
      correctionId = correction.id;
    }

    return { reversalId: reversal.id, correctionId };
  });

  const [origExpense] = await db.select().from(expensesTable).where(eq(expensesTable.id, original.id));
  const [reversalExpense] = await db.select().from(expensesTable).where(eq(expensesTable.id, result.reversalId));
  const correctionExpense = result.correctionId != null
    ? (await db.select().from(expensesTable).where(eq(expensesTable.id, result.correctionId)))[0]
    : null;

  res.json({
    original: toExpenseResponse(origExpense),
    reversal: toExpenseResponse(reversalExpense),
    ...(correctionExpense ? { correction: toExpenseResponse(correctionExpense) } : {}),
  });
});

export default router;
