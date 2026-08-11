import { Router, type IRouter } from "express";
import { db, supplierPaymentsTable, suppliersTable } from "@workspace/db";
import { cashbookEntriesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  CreateSupplierPaymentBody,
  GetSupplierPaymentParams,
  CorrectSupplierPaymentParams,
  CorrectSupplierPaymentBody,
} from "@workspace/api-zod";

// Zod coerces date strings to JS Date objects. Format them back to YYYY-MM-DD for Postgres.
function toDateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}

const router: IRouter = Router();

function toSupplierPaymentResponse(p: typeof supplierPaymentsTable.$inferSelect, supplierName: string) {
  return {
    id: p.id, supplierId: p.supplierId, supplierName,
    date: p.date, paymentMode: p.paymentMode, amount: parseFloat(p.amount),
    bankAccount: p.bankAccount ?? null, chequeNo: p.chequeNo ?? null, notes: p.notes ?? null, createdAt: p.createdAt,
    status: p.status, reversesId: p.reversesId ?? null, correctsId: p.correctsId ?? null,
  };
}

router.get("/supplier-payments", requireAuth, async (req, res): Promise<void> => {
  // Read filters straight from the raw query string — see payments.ts for why
  // (ListPaymentsQueryParams's from/to are typed zod.date(), not coerce.date()).
  const conditions = [];
  if (req.query.supplierId) conditions.push(eq(supplierPaymentsTable.supplierId, Number(req.query.supplierId)));
  if (req.query.from) conditions.push(gte(supplierPaymentsTable.date, String(req.query.from)));
  if (req.query.to) conditions.push(lte(supplierPaymentsTable.date, String(req.query.to)));
  const modes = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"];
  if (typeof req.query.paymentMode === "string" && modes.includes(req.query.paymentMode)) {
    conditions.push(eq(supplierPaymentsTable.paymentMode, req.query.paymentMode as typeof supplierPaymentsTable.$inferSelect["paymentMode"]));
  }
  // Default to only "live" rows — reversed originals and reversal paper-trail rows
  // are excluded unless explicitly asked for (see the correction workflow).
  if (req.query.includeReversed !== "true") conditions.push(eq(supplierPaymentsTable.status, "posted"));
  const rows = await db.select().from(supplierPaymentsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(supplierPaymentsTable.date));
  const result = await Promise.all(rows.map(async (p) => {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, p.supplierId));
    return toSupplierPaymentResponse(p, s?.name ?? "");
  }));
  res.json(result);
});

router.post("/supplier-payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSupplierPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { supplierId, date, paymentMode, amount, bankAccount, chequeNo, notes } = parsed.data;
  const userId = (req.session as any)?.userId ?? null;

  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  const dateStr = toDateStr(date);

  const [p] = await db.insert(supplierPaymentsTable).values({
    supplierId, date: dateStr, paymentMode, amount: String(amount),
    bankAccount: bankAccount ?? null, chequeNo: chequeNo ?? null, notes: notes ?? null, createdById: userId,
  }).returning();

  // Auto-post to cashbook
  await db.insert(cashbookEntriesTable).values({
    date: dateStr,
    type: "cash_out",
    source: "supplier_payment",
    referenceId: p.id,
    description: `Payment to ${s?.name ?? "supplier"}`,
    paymentMode,
    amount: String(amount),
    notes: notes ?? null,
    createdById: userId,
  });

  res.status(201).json(toSupplierPaymentResponse(p, s?.name ?? ""));
});

router.get("/supplier-payments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSupplierPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [p] = await db.select().from(supplierPaymentsTable).where(eq(supplierPaymentsTable.id, params.data.id));
  if (!p) { res.status(404).json({ error: "Supplier payment not found" }); return; }
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, p.supplierId));
  res.json(toSupplierPaymentResponse(p, s?.name ?? ""));
});

// Correction workflow — see lib/db/src/schema/payments.ts / routes/payments.ts for the
// full design (this mirrors it exactly for the supplier side). A posted supplier payment
// is never edited or deleted in place. This either reverses it with no replacement
// (void: true), or reverses it and posts a new corrected payment in its place (default) —
// and in both cases, correctly reverses/reposts the payment's auto-posted cashbook entry
// too, so cashbook balance (and supplier payable balance) reflect the correction.
router.post("/supplier-payments/:id/correct", requireRole("owner"), async (req, res): Promise<void> => {
  const params = CorrectSupplierPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CorrectSupplierPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [original] = await db.select().from(supplierPaymentsTable).where(eq(supplierPaymentsTable.id, params.data.id));
  if (!original) { res.status(404).json({ error: "Supplier payment not found" }); return; }
  if (original.status !== "posted") {
    res.status(409).json({ error: `This payment is already ${original.status} — correct its replacement instead, not this row.` });
    return;
  }

  const isVoid = parsed.data.void === true;
  if (!isVoid && (parsed.data.supplierId == null || parsed.data.date == null || parsed.data.paymentMode == null || parsed.data.amount == null)) {
    res.status(400).json({ error: "supplierId, date, paymentMode, and amount are required unless void=true" });
    return;
  }

  const userId = (req.session as any)?.userId ?? null;
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, original.supplierId));
  const [correctedSupplier] = !isVoid && parsed.data.supplierId !== original.supplierId
    ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, parsed.data.supplierId!))
    : [supplier];

  const result = await db.transaction(async (tx) => {
    // 1. Insert the reversal payment — a literal mirror of the original. Its notes carry
    // the submitted correction reason (falling back to the original's own notes if none
    // given) — reversal rows are never shown directly, only surfaced as the "why" behind
    // a correction/void in the history view.
    const [reversal] = await tx.insert(supplierPaymentsTable).values({
      supplierId: original.supplierId, date: original.date, paymentMode: original.paymentMode, amount: original.amount,
      bankAccount: original.bankAccount, chequeNo: original.chequeNo, notes: parsed.data.reason ?? original.notes,
      status: "reversal", reversesId: original.id,
    }).returning();

    // 2. Reverse the cashbook entry this payment originally auto-posted (if it's still
    // live — tolerate it being missing/already-reversed rather than failing the whole
    // correction over a data-consistency edge case).
    const [linkedCashbookEntry] = await tx.select().from(cashbookEntriesTable)
      .where(and(eq(cashbookEntriesTable.source, "supplier_payment"), eq(cashbookEntriesTable.referenceId, original.id), eq(cashbookEntriesTable.status, "posted")));
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
    await tx.update(supplierPaymentsTable).set({ status: "reversed" }).where(eq(supplierPaymentsTable.id, original.id));

    // 4. If this is a correction (not a pure void), post the replacement payment and
    // its own fresh cashbook entry.
    let correctionId: number | null = null;
    if (!isVoid) {
      const dateStr = toDateStr(parsed.data.date!);
      const [correction] = await tx.insert(supplierPaymentsTable).values({
        supplierId: parsed.data.supplierId!, date: dateStr, paymentMode: parsed.data.paymentMode!, amount: String(parsed.data.amount!),
        bankAccount: parsed.data.bankAccount ?? null, chequeNo: parsed.data.chequeNo ?? null, notes: parsed.data.notes ?? null,
        status: "posted", correctsId: original.id, createdById: userId,
      }).returning();
      await tx.insert(cashbookEntriesTable).values({
        date: dateStr, type: "cash_out", source: "supplier_payment", referenceId: correction.id,
        description: `Payment to ${correctedSupplier?.name ?? "supplier"}`,
        paymentMode: parsed.data.paymentMode!,
        amount: String(parsed.data.amount!), notes: parsed.data.notes ?? null, createdById: userId,
      });
      correctionId = correction.id;
    }

    return { reversal, correctionId };
  });

  const correctionRow = result.correctionId != null
    ? (await db.select().from(supplierPaymentsTable).where(eq(supplierPaymentsTable.id, result.correctionId)))[0]
    : null;

  res.json({
    original: toSupplierPaymentResponse({ ...original, status: "reversed" }, supplier?.name ?? ""),
    reversal: toSupplierPaymentResponse(result.reversal, supplier?.name ?? ""),
    ...(correctionRow ? { correction: toSupplierPaymentResponse(correctionRow, correctedSupplier?.name ?? "") } : {}),
  });
});

export default router;
