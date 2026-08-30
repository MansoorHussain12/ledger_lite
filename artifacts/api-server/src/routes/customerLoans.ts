import { Router, type IRouter } from "express";
import { db, customerLoansTable, customersTable } from "@workspace/db";
import { cashbookEntriesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  CreateCustomerLoanBody,
  GetCustomerLoanParams,
  CorrectCustomerLoanParams,
  CorrectCustomerLoanBody,
} from "@workspace/api-zod";

// Zod coerces date strings to JS Date objects. Format them back to YYYY-MM-DD for Postgres.
function toDateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}

const router: IRouter = Router();

function toCustomerLoanResponse(p: typeof customerLoansTable.$inferSelect, customerName: string) {
  return {
    id: p.id, customerId: p.customerId, customerName,
    date: p.date, paymentMode: p.paymentMode, amount: parseFloat(p.amount),
    bankAccount: p.bankAccount ?? null, chequeNo: p.chequeNo ?? null, notes: p.notes ?? null, createdAt: p.createdAt,
    status: p.status, reversesId: p.reversesId ?? null, correctsId: p.correctsId ?? null,
  };
}

router.get("/customer-loans", requireAuth, async (req, res): Promise<void> => {
  // Read filters straight from the raw query string — see payments.ts for why
  // (ListPaymentsQueryParams's from/to are typed zod.date(), not coerce.date()).
  const conditions = [];
  if (req.query.customerId) conditions.push(eq(customerLoansTable.customerId, Number(req.query.customerId)));
  if (req.query.from) conditions.push(gte(customerLoansTable.date, String(req.query.from)));
  if (req.query.to) conditions.push(lte(customerLoansTable.date, String(req.query.to)));
  const modes = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"];
  if (typeof req.query.paymentMode === "string" && modes.includes(req.query.paymentMode)) {
    conditions.push(eq(customerLoansTable.paymentMode, req.query.paymentMode as typeof customerLoansTable.$inferSelect["paymentMode"]));
  }
  // Default to only "live" rows — reversed originals and reversal paper-trail rows
  // are excluded unless explicitly asked for (see the correction workflow).
  if (req.query.includeReversed !== "true") conditions.push(eq(customerLoansTable.status, "posted"));
  const rows = await db.select().from(customerLoansTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(customerLoansTable.date));
  const result = await Promise.all(rows.map(async (p) => {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
    return toCustomerLoanResponse(p, c?.name ?? "");
  }));
  res.json(result);
});

router.post("/customer-loans", requireRole("owner", "cashier"), async (req, res): Promise<void> => {
  const parsed = CreateCustomerLoanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { customerId, date, paymentMode, amount, bankAccount, chequeNo, notes } = parsed.data;
  const userId = (req.session as any)?.userId ?? null;

  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  const dateStr = toDateStr(date);

  const [p] = await db.insert(customerLoansTable).values({
    customerId, date: dateStr, paymentMode, amount: String(amount),
    bankAccount: bankAccount ?? null, chequeNo: chequeNo ?? null, notes: notes ?? null, createdById: userId,
  }).returning();

  // Auto-post to cashbook — cash lent out still leaves the till (cash_out), same as a
  // supplier payment, but the reference type identifies it as a customer loan.
  await db.insert(cashbookEntriesTable).values({
    date: dateStr,
    type: "cash_out",
    source: "customer_loan",
    referenceId: p.id,
    description: `Loan to ${c?.name ?? "customer"}`,
    paymentMode,
    amount: String(amount),
    notes: notes ?? null,
    createdById: userId,
  });

  res.status(201).json(toCustomerLoanResponse(p, c?.name ?? ""));
});

router.get("/customer-loans/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCustomerLoanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [p] = await db.select().from(customerLoansTable).where(eq(customerLoansTable.id, params.data.id));
  if (!p) { res.status(404).json({ error: "Customer loan not found" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
  res.json(toCustomerLoanResponse(p, c?.name ?? ""));
});

// Correction workflow — see lib/db/src/schema/payments.ts / routes/payments.ts for the
// full design (this mirrors it exactly for customer loans). A posted loan is never
// edited or deleted in place. This either reverses it with no replacement (void: true),
// or reverses it and posts a new corrected loan in its place (default) — and in both
// cases, correctly reverses/reposts the loan's auto-posted cashbook entry too, so
// cashbook balance (and customer receivable balance) reflect the correction.
router.post("/customer-loans/:id/correct", requireRole("owner", "cashier"), async (req, res): Promise<void> => {
  const params = CorrectCustomerLoanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CorrectCustomerLoanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [original] = await db.select().from(customerLoansTable).where(eq(customerLoansTable.id, params.data.id));
  if (!original) { res.status(404).json({ error: "Customer loan not found" }); return; }
  if (original.status !== "posted") {
    res.status(409).json({ error: `This loan is already ${original.status} — correct its replacement instead, not this row.` });
    return;
  }

  const isVoid = parsed.data.void === true;
  if (!isVoid && (parsed.data.customerId == null || parsed.data.date == null || parsed.data.paymentMode == null || parsed.data.amount == null)) {
    res.status(400).json({ error: "customerId, date, paymentMode, and amount are required unless void=true" });
    return;
  }

  const userId = (req.session as any)?.userId ?? null;
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, original.customerId));
  const [correctedCustomer] = !isVoid && parsed.data.customerId !== original.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, parsed.data.customerId!))
    : [customer];

  const result = await db.transaction(async (tx) => {
    // 1. Insert the reversal loan — a literal mirror of the original. Its notes carry
    // the submitted correction reason (falling back to the original's own notes if none
    // given) — reversal rows are never shown directly, only surfaced as the "why" behind
    // a correction/void in the history view.
    const [reversal] = await tx.insert(customerLoansTable).values({
      customerId: original.customerId, date: original.date, paymentMode: original.paymentMode, amount: original.amount,
      bankAccount: original.bankAccount, chequeNo: original.chequeNo, notes: parsed.data.reason ?? original.notes,
      status: "reversal", reversesId: original.id,
    }).returning();

    // 2. Reverse the cashbook entry this loan originally auto-posted (if it's still
    // live — tolerate it being missing/already-reversed rather than failing the whole
    // correction over a data-consistency edge case).
    const [linkedCashbookEntry] = await tx.select().from(cashbookEntriesTable)
      .where(and(eq(cashbookEntriesTable.source, "customer_loan"), eq(cashbookEntriesTable.referenceId, original.id), eq(cashbookEntriesTable.status, "posted")));
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
    await tx.update(customerLoansTable).set({ status: "reversed" }).where(eq(customerLoansTable.id, original.id));

    // 4. If this is a correction (not a pure void), post the replacement loan and
    // its own fresh cashbook entry.
    let correctionId: number | null = null;
    if (!isVoid) {
      const dateStr = toDateStr(parsed.data.date!);
      const [correction] = await tx.insert(customerLoansTable).values({
        customerId: parsed.data.customerId!, date: dateStr, paymentMode: parsed.data.paymentMode!, amount: String(parsed.data.amount!),
        bankAccount: parsed.data.bankAccount ?? null, chequeNo: parsed.data.chequeNo ?? null, notes: parsed.data.notes ?? null,
        status: "posted", correctsId: original.id, createdById: userId,
      }).returning();
      await tx.insert(cashbookEntriesTable).values({
        date: dateStr, type: "cash_out", source: "customer_loan", referenceId: correction.id,
        description: `Loan to ${correctedCustomer?.name ?? "customer"}`,
        paymentMode: parsed.data.paymentMode!,
        amount: String(parsed.data.amount!), notes: parsed.data.notes ?? null, createdById: userId,
      });
      correctionId = correction.id;
    }

    return { reversal, correctionId };
  });

  const correctionRow = result.correctionId != null
    ? (await db.select().from(customerLoansTable).where(eq(customerLoansTable.id, result.correctionId)))[0]
    : null;

  res.json({
    original: toCustomerLoanResponse({ ...original, status: "reversed" }, customer?.name ?? ""),
    reversal: toCustomerLoanResponse(result.reversal, customer?.name ?? ""),
    ...(correctionRow ? { correction: toCustomerLoanResponse(correctionRow, correctedCustomer?.name ?? "") } : {}),
  });
});

export default router;
