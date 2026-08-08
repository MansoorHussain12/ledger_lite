import { Router, type IRouter } from "express";
import { db, paymentsTable, customersTable } from "@workspace/db";
import { cashbookEntriesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

// Zod coerces date strings to JS Date objects. Format them back to YYYY-MM-DD for Postgres.
function toDateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}
import {
  CreatePaymentBody,
  GetPaymentParams,
  CorrectPaymentParams,
  CorrectPaymentBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function toPaymentResponse(p: typeof paymentsTable.$inferSelect, customerName: string) {
  return {
    id: p.id, customerId: p.customerId, customerName,
    date: p.date, type: p.type, amount: parseFloat(p.amount),
    bankAccount: p.bankAccount ?? null, chequeNo: p.chequeNo ?? null, notes: p.notes ?? null, createdAt: p.createdAt,
    status: p.status, reversesId: p.reversesId ?? null, correctsId: p.correctsId ?? null,
  };
}

router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  // Read filters straight from the raw query string rather than the generated
  // ListPaymentsQueryParams.safeParse(): its `from`/`to` fields are typed zod.date()
  // (not coerce.date()), so an ordinary query-string date value always fails
  // validation — which used to silently drop *every* filter (including customerId),
  // not just the date filter, the moment a date range was present.
  const conditions = [];
  if (req.query.customerId) conditions.push(eq(paymentsTable.customerId, Number(req.query.customerId)));
  if (req.query.from) conditions.push(gte(paymentsTable.date, String(req.query.from)));
  if (req.query.to) conditions.push(lte(paymentsTable.date, String(req.query.to)));
  if (req.query.type === "cash" || req.query.type === "bank") conditions.push(eq(paymentsTable.type, req.query.type));
  // Default to only "live" rows — reversed originals and reversal paper-trail rows
  // are excluded unless explicitly asked for (see the correction workflow).
  if (req.query.includeReversed !== "true") conditions.push(eq(paymentsTable.status, "posted"));
  const rows = await db.select().from(paymentsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(paymentsTable.date));
  const result = await Promise.all(rows.map(async (p) => {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
    return toPaymentResponse(p, c?.name ?? "");
  }));
  res.json(result);
});

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { customerId, date, type, amount, bankAccount, chequeNo, notes } = parsed.data;
  const userId = (req.session as any)?.userId ?? null;

  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  const dateStr = toDateStr(date);

  const [p] = await db.insert(paymentsTable).values({
    customerId, date: dateStr, type, amount: String(amount),
    bankAccount: bankAccount ?? null, chequeNo: chequeNo ?? null, notes: notes ?? null,
  }).returning();

  // Auto-post to cashbook
  await db.insert(cashbookEntriesTable).values({
    date: dateStr,
    type: "cash_in",
    source: "payment",
    referenceId: p.id,
    description: `Receipt from ${c?.name ?? "customer"}`,
    paymentMode: type === "cash" ? "cash" : "bank",
    amount: String(amount),
    notes: notes ?? null,
    createdById: userId,
  });

  res.status(201).json(toPaymentResponse(p, c?.name ?? ""));
});

router.get("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [p] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!p) { res.status(404).json({ error: "Payment not found" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
  res.json(toPaymentResponse(p, c?.name ?? ""));
});

// Correction workflow — see lib/db/src/schema/payments.ts for the full design. A posted
// payment is never edited or deleted in place. This either reverses it with no
// replacement (void: true), or reverses it and posts a new corrected payment in its
// place (default) — and in both cases, correctly reverses/reposts the payment's
// auto-posted cashbook entry too, so cashbook balance reflects the correction.
router.post("/payments/:id/correct", requireRole("owner"), async (req, res): Promise<void> => {
  const params = CorrectPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CorrectPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [original] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!original) { res.status(404).json({ error: "Payment not found" }); return; }
  if (original.status !== "posted") {
    res.status(409).json({ error: `This payment is already ${original.status} — correct its replacement instead, not this row.` });
    return;
  }

  const isVoid = parsed.data.void === true;
  if (!isVoid && (parsed.data.customerId == null || parsed.data.date == null || parsed.data.type == null || parsed.data.amount == null)) {
    res.status(400).json({ error: "customerId, date, type, and amount are required unless void=true" });
    return;
  }

  const userId = (req.session as any)?.userId ?? null;
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, original.customerId));
  const [correctedCustomer] = !isVoid && parsed.data.customerId !== original.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, parsed.data.customerId!))
    : [customer];

  const result = await db.transaction(async (tx) => {
    // 1. Insert the reversal payment — a literal mirror of the original. Its notes carry
    // the submitted correction reason (falling back to the original's own notes if none
    // given) — reversal rows are never shown directly, only surfaced as the "why" behind
    // a correction/void in the history view.
    const [reversal] = await tx.insert(paymentsTable).values({
      customerId: original.customerId, date: original.date, type: original.type, amount: original.amount,
      bankAccount: original.bankAccount, chequeNo: original.chequeNo, notes: parsed.data.reason ?? original.notes,
      status: "reversal", reversesId: original.id,
    }).returning();

    // 2. Reverse the cashbook entry this payment originally auto-posted (if it's still
    // live — tolerate it being missing/already-reversed rather than failing the whole
    // correction over a data-consistency edge case).
    const [linkedCashbookEntry] = await tx.select().from(cashbookEntriesTable)
      .where(and(eq(cashbookEntriesTable.source, "payment"), eq(cashbookEntriesTable.referenceId, original.id), eq(cashbookEntriesTable.status, "posted")));
    if (linkedCashbookEntry) {
      await tx.insert(cashbookEntriesTable).values({
        date: linkedCashbookEntry.date, type: linkedCashbookEntry.type, source: linkedCashbookEntry.source,
        referenceId: linkedCashbookEntry.referenceId, description: `Reversal: ${linkedCashbookEntry.description}`,
        paymentMode: linkedCashbookEntry.paymentMode, amount: linkedCashbookEntry.amount, notes: linkedCashbookEntry.notes,
        createdById: userId, status: "reversal", reversesId: linkedCashbookEntry.id,
      });
      await tx.update(cashbookEntriesTable).set({ status: "reversed" }).where(eq(cashbookEntriesTable.id, linkedCashbookEntry.id));
    }

    // 3. The original's only mutation, ever: flip its status. No business field changes.
    await tx.update(paymentsTable).set({ status: "reversed" }).where(eq(paymentsTable.id, original.id));

    // 4. If this is a correction (not a pure void), post the replacement payment and
    // its own fresh cashbook entry.
    let correctionId: number | null = null;
    if (!isVoid) {
      const dateStr = toDateStr(parsed.data.date!);
      const [correction] = await tx.insert(paymentsTable).values({
        customerId: parsed.data.customerId!, date: dateStr, type: parsed.data.type!, amount: String(parsed.data.amount!),
        bankAccount: parsed.data.bankAccount ?? null, chequeNo: parsed.data.chequeNo ?? null, notes: parsed.data.notes ?? null,
        status: "posted", correctsId: original.id,
      }).returning();
      await tx.insert(cashbookEntriesTable).values({
        date: dateStr, type: "cash_in", source: "payment", referenceId: correction.id,
        description: `Receipt from ${correctedCustomer?.name ?? "customer"}`,
        paymentMode: parsed.data.type === "cash" ? "cash" : "bank",
        amount: String(parsed.data.amount!), notes: parsed.data.notes ?? null, createdById: userId,
      });
      correctionId = correction.id;
    }

    return { reversal, correctionId };
  });

  const correctionRow = result.correctionId != null
    ? (await db.select().from(paymentsTable).where(eq(paymentsTable.id, result.correctionId)))[0]
    : null;

  res.json({
    original: toPaymentResponse({ ...original, status: "reversed" }, customer?.name ?? ""),
    reversal: toPaymentResponse(result.reversal, customer?.name ?? ""),
    ...(correctionRow ? { correction: toPaymentResponse(correctionRow, correctedCustomer?.name ?? "") } : {}),
  });
});

export default router;
