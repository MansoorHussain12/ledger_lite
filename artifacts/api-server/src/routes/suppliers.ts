import { Router } from "express";
import { db } from "@workspace/db";
import {
  suppliersTable,
  purchaseInvoicesTable,
  purchaseInvoiceItemsTable,
  productsTable,
  cashbookEntriesTable,
  supplierPaymentsTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

function toDateStr(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d);
}

// ── helpers: supplier payable balance ────────────────────────────────────────
// balance = opening_balance + sum(purchase.total_amount) - sum(purchase.paid_amount)
//           - sum(supplier_payments.amount)
// The last term is money paid against the running balance separately from any one
// invoice (see supplierPayments.ts) — same relationship customer payments have to
// sale orders.

async function supplierBalance(supplierId: number): Promise<number> {
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!s) return 0;
  // Only "live" (posted) invoices — a reversed/corrected mistake is excluded, so this
  // reflects the correction, not the mistake (see the correction workflow).
  const [agg] = await db
    .select({
      totalBilled: sql<string>`coalesce(sum(total_amount),0)`,
      totalPaid: sql<string>`coalesce(sum(paid_amount),0)`,
    })
    .from(purchaseInvoicesTable)
    .where(and(eq(purchaseInvoicesTable.supplierId, supplierId), eq(purchaseInvoicesTable.status, "posted")));

  const [paymentsAgg] = await db
    .select({ total: sql<string>`coalesce(sum(amount),0)` })
    .from(supplierPaymentsTable)
    .where(and(eq(supplierPaymentsTable.supplierId, supplierId), eq(supplierPaymentsTable.status, "posted")));

  const opening = parseFloat(s.openingBalance ?? "0");
  const billed = parseFloat(agg?.totalBilled ?? "0");
  const paid = parseFloat(agg?.totalPaid ?? "0");
  const directPayments = parseFloat(paymentsAgg?.total ?? "0");
  return Math.round((opening + billed - paid - directPayments) * 100) / 100;
}

// ── GET /suppliers ────────────────────────────────────────────────────────────

router.get("/suppliers", requireAuth, async (_req, res) => {
  const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  const result = await Promise.all(
    rows.map(async (s) => ({
      id: s.id,
      name: s.name,
      contact: s.contact ?? null,
      address: s.address ?? null,
      ntn: s.ntn ?? null,
      openingBalance: parseFloat(s.openingBalance ?? "0"),
      createdAt: s.createdAt,
      payableBalance: await supplierBalance(s.id),
    }))
  );
  res.json(result);
});

// ── POST /suppliers ───────────────────────────────────────────────────────────

const supplierInputSchema = z.object({
  name: z.string().min(1),
  contact: z.string().optional(),
  address: z.string().optional(),
  ntn: z.string().optional(),
  openingBalance: z.coerce.number().optional().default(0),
  openingBalanceDate: z.string().optional(),
});

router.post("/suppliers", requireAuth, async (req, res) => {
  const parsed = supplierInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed" }); return; }
  const d = parsed.data;
  const [s] = await db
    .insert(suppliersTable)
    .values({
      name: d.name,
      contact: d.contact ?? null,
      address: d.address ?? null,
      ntn: d.ntn ?? null,
      openingBalance: String(d.openingBalance ?? 0),
      openingBalanceDate: d.openingBalanceDate ?? null,
    })
    .returning();
  res.status(201).json({ ...s, openingBalance: parseFloat(s.openingBalance ?? "0"), payableBalance: parseFloat(s.openingBalance ?? "0") });
});

// ── GET /suppliers/:id ────────────────────────────────────────────────────────

router.get("/suppliers/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!s) { res.status(404).json({ error: "Supplier not found" }); return; }

  const invoices = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(and(eq(purchaseInvoicesTable.supplierId, id), eq(purchaseInvoicesTable.status, "posted")))
    .orderBy(desc(purchaseInvoicesTable.date), desc(purchaseInvoicesTable.id));

  const balance = await supplierBalance(id);

  res.json({
    id: s.id,
    name: s.name,
    contact: s.contact ?? null,
    address: s.address ?? null,
    ntn: s.ntn ?? null,
    openingBalance: parseFloat(s.openingBalance ?? "0"),
    createdAt: s.createdAt,
    payableBalance: balance,
    invoices: invoices.map((inv) => ({
      id: inv.id,
      date: toDateStr(inv.date),
      invoiceNo: inv.invoiceNo ?? null,
      totalAmount: parseFloat(inv.totalAmount),
      paidAmount: parseFloat(inv.paidAmount),
      balance: parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount),
      paymentMode: inv.paymentMode,
      notes: inv.notes ?? null,
      createdAt: inv.createdAt,
    })),
  });
});

// ── PATCH /suppliers/:id ──────────────────────────────────────────────────────

router.patch("/suppliers/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = supplierInputSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed" }); return; }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.name != null) updates.name = d.name;
  if (d.contact !== undefined) updates.contact = d.contact ?? null;
  if (d.address !== undefined) updates.address = d.address ?? null;
  if (d.ntn !== undefined) updates.ntn = d.ntn ?? null;
  if (d.openingBalance != null) updates.openingBalance = String(d.openingBalance);
  if (d.openingBalanceDate !== undefined) updates.openingBalanceDate = d.openingBalanceDate ?? null;

  const [s] = await db.update(suppliersTable).set(updates).where(eq(suppliersTable.id, id)).returning();
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...s, openingBalance: parseFloat(s.openingBalance ?? "0"), payableBalance: await supplierBalance(id) });
});

// ── DELETE /suppliers/:id ─────────────────────────────────────────────────────

router.delete("/suppliers/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
  res.status(204).send();
});

// ── GET /purchases ────────────────────────────────────────────────────────────

function toPurchaseResponse(inv: typeof purchaseInvoicesTable.$inferSelect, supplierName: string) {
  return {
    id: inv.id,
    supplierId: inv.supplierId,
    supplierName,
    date: toDateStr(inv.date),
    invoiceNo: inv.invoiceNo ?? null,
    totalAmount: parseFloat(inv.totalAmount),
    paidAmount: parseFloat(inv.paidAmount),
    balance: parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount),
    paymentMode: inv.paymentMode,
    notes: inv.notes ?? null,
    createdAt: inv.createdAt,
    status: inv.status, reversesId: inv.reversesId ?? null, correctsId: inv.correctsId ?? null,
  };
}

router.get("/purchases", requireAuth, async (req, res) => {
  const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string, 10) : undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const includeReversed = req.query.includeReversed === "true";

  const conditions = [];
  if (supplierId) conditions.push(eq(purchaseInvoicesTable.supplierId, supplierId));
  if (from) conditions.push(gte(purchaseInvoicesTable.date, from));
  if (to) conditions.push(lte(purchaseInvoicesTable.date, to));
  // Default to only "live" rows — reversed originals and reversal paper-trail rows are
  // excluded unless explicitly asked for (see the correction workflow).
  if (!includeReversed) conditions.push(eq(purchaseInvoicesTable.status, "posted"));

  const rows = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(purchaseInvoicesTable.date), desc(purchaseInvoicesTable.id));

  const result = await Promise.all(
    rows.map(async (inv) => {
      const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, inv.supplierId));
      return toPurchaseResponse(inv, s?.name ?? "");
    })
  );
  res.json(result);
});

// ── POST /purchases ───────────────────────────────────────────────────────────

const purchaseItemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().positive(),
});

const purchaseInputSchema = z.object({
  supplierId: z.number().int().positive(),
  date: z.string().min(1),
  invoiceNo: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1),
  paidAmount: z.coerce.number().min(0).default(0),
  paymentMode: z.enum(["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"]).default("cash"),
  notes: z.string().optional(),
  updateCostPrice: z.boolean().optional().default(true),
});

router.post("/purchases", requireAuth, async (req, res) => {
  const parsed = purchaseInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const d = parsed.data;
  const userId = (req.session as any)?.userId ?? null;

  const itemsWithAmount = d.items.map((item) => ({
    ...item,
    amount: Math.round(item.qty * item.rate * 100) / 100,
  }));
  const totalAmount = itemsWithAmount.reduce((s, i) => s + i.amount, 0);
  const paidAmount = Math.min(d.paidAmount, totalAmount);

  const result = await db.transaction(async (tx) => {
    // Create invoice
    const [inv] = await tx
      .insert(purchaseInvoicesTable)
      .values({
        supplierId: d.supplierId,
        date: d.date,
        invoiceNo: d.invoiceNo ?? null,
        totalAmount: String(totalAmount),
        paidAmount: String(paidAmount),
        paymentMode: d.paymentMode,
        notes: d.notes ?? null,
        createdById: userId,
      })
      .returning();

    // Create items
    await tx.insert(purchaseInvoiceItemsTable).values(
      itemsWithAmount.map((item) => ({
        purchaseInvoiceId: inv.id,
        productId: item.productId,
        qty: String(item.qty),
        rate: String(item.rate),
        amount: String(item.amount),
      }))
    );

    // Optionally update cost price of each product to latest purchase rate
    if (d.updateCostPrice) {
      for (const item of d.items) {
        await tx
          .update(productsTable)
          .set({ costPrice: String(item.rate) })
          .where(eq(productsTable.id, item.productId));
      }
    }

    // If cash was paid, post to cashbook
    if (paidAmount > 0) {
      const [s] = await tx.select().from(suppliersTable).where(eq(suppliersTable.id, d.supplierId));
      await tx.insert(cashbookEntriesTable).values({
        date: d.date,
        type: "cash_out",
        source: "purchase",
        referenceId: inv.id,
        description: `Purchase payment to ${s?.name ?? "supplier"}${d.invoiceNo ? ` (Inv #${d.invoiceNo})` : ""}`,
        paymentMode: d.paymentMode,
        amount: String(paidAmount),
        notes: d.notes ?? null,
        createdById: userId,
      });
    }

    return inv;
  });

  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, result.supplierId));
  res.status(201).json(toPurchaseResponse(result, s?.name ?? ""));
});

// ── GET /purchases/:id ────────────────────────────────────────────────────────

async function getPurchaseItems(purchaseInvoiceId: number) {
  const items = await db
    .select()
    .from(purchaseInvoiceItemsTable)
    .where(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, purchaseInvoiceId));

  return Promise.all(
    items.map(async (item) => {
      const [p] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
      return {
        id: item.id,
        productId: item.productId,
        productName: p?.name ?? "",
        qty: parseFloat(item.qty),
        rate: parseFloat(item.rate),
        amount: parseFloat(item.amount),
      };
    })
  );
}

router.get("/purchases/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [inv] = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Not found" }); return; }

  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, inv.supplierId));
  const itemsWithProduct = await getPurchaseItems(id);

  res.json({ ...toPurchaseResponse(inv, s?.name ?? ""), items: itemsWithProduct });
});

// ── POST /purchases/:id/correct ─────────────────────────────────────────────────
// Correction workflow — see lib/db/src/schema/saleOrders.ts for the full design. A
// posted purchase invoice is never edited or deleted in place. This either reverses it
// with no replacement (void: true), or reverses it and posts a new corrected invoice in
// its place (default) — and in both cases, correctly reverses/reposts the invoice's
// auto-posted cashbook entry too, so cashbook and supplier balance reflect the
// correction, and (if updateCostPrice was set) re-applies the product cost-price update.

const correctionItemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().positive(),
});

const purchaseCorrectionSchema = z.object({
  void: z.boolean().optional(),
  reason: z.string().optional(),
  supplierId: z.number().int().positive().optional(),
  date: z.string().min(1).optional(),
  invoiceNo: z.string().optional(),
  items: z.array(correctionItemSchema).optional(),
  paidAmount: z.coerce.number().min(0).optional(),
  paymentMode: z.enum(["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"]).optional(),
  notes: z.string().optional(),
  updateCostPrice: z.boolean().optional().default(true),
});

router.post("/purchases/:id/correct", requireRole("owner"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = purchaseCorrectionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const d = parsed.data;

  const [original] = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, id));
  if (!original) { res.status(404).json({ error: "Purchase invoice not found" }); return; }
  if (original.status !== "posted") {
    res.status(409).json({ error: `This invoice is already ${original.status} — correct its replacement instead, not this row.` });
    return;
  }

  const isVoid = d.void === true;
  if (!isVoid && (d.supplierId == null || d.date == null || !d.items?.length)) {
    res.status(400).json({ error: "supplierId, date, and items are required unless void=true" });
    return;
  }

  const originalItems = await db.select().from(purchaseInvoiceItemsTable).where(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, original.id));
  const userId = (req.session as any)?.userId ?? null;

  const result = await db.transaction(async (tx) => {
    // 1. Insert the reversal — a literal mirror of the original, for the paper trail. Its
    // notes carry the submitted correction reason (falling back to the original's own
    // notes if none given) — reversal rows are never shown directly, only surfaced as the
    // "why" behind a correction/void in the history view.
    const [reversal] = await tx.insert(purchaseInvoicesTable).values({
      supplierId: original.supplierId, date: original.date, invoiceNo: original.invoiceNo,
      totalAmount: original.totalAmount, paidAmount: original.paidAmount, paymentMode: original.paymentMode,
      notes: d.reason ?? original.notes, createdById: original.createdById,
      status: "reversal", reversesId: original.id,
    }).returning();
    for (const item of originalItems) {
      await tx.insert(purchaseInvoiceItemsTable).values({
        purchaseInvoiceId: reversal.id, productId: item.productId, qty: item.qty, rate: item.rate, amount: item.amount,
      });
    }

    // 2. Reverse the cashbook entry this purchase originally auto-posted (if it's still
    // live — tolerate it being missing/already-reversed rather than failing the whole
    // correction over a data-consistency edge case).
    const [linkedCashbookEntry] = await tx.select().from(cashbookEntriesTable)
      .where(and(eq(cashbookEntriesTable.source, "purchase"), eq(cashbookEntriesTable.referenceId, original.id), eq(cashbookEntriesTable.status, "posted")));
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
    await tx.update(purchaseInvoicesTable).set({ status: "reversed" }).where(eq(purchaseInvoicesTable.id, original.id));

    // 4. If this is a correction (not a pure void), post the replacement invoice, its
    // cashbook entry (if paid), and re-apply updateCostPrice.
    let correctionId: number | null = null;
    if (!isVoid) {
      const itemsWithAmount = d.items!.map((item) => ({ ...item, amount: Math.round(item.qty * item.rate * 100) / 100 }));
      const totalAmount = itemsWithAmount.reduce((s, i) => s + i.amount, 0);
      const paidAmount = Math.min(d.paidAmount ?? 0, totalAmount);
      const paymentMode = d.paymentMode ?? "cash";

      const [correction] = await tx.insert(purchaseInvoicesTable).values({
        supplierId: d.supplierId!, date: d.date!, invoiceNo: d.invoiceNo ?? null,
        totalAmount: String(totalAmount), paidAmount: String(paidAmount), paymentMode,
        notes: d.notes ?? null, createdById: userId,
        status: "posted", correctsId: original.id,
      }).returning();
      await tx.insert(purchaseInvoiceItemsTable).values(
        itemsWithAmount.map((item) => ({
          purchaseInvoiceId: correction.id, productId: item.productId, qty: String(item.qty), rate: String(item.rate), amount: String(item.amount),
        }))
      );

      if (d.updateCostPrice) {
        for (const item of d.items!) {
          await tx.update(productsTable).set({ costPrice: String(item.rate) }).where(eq(productsTable.id, item.productId));
        }
      }

      if (paidAmount > 0) {
        const [s] = await tx.select().from(suppliersTable).where(eq(suppliersTable.id, d.supplierId!));
        await tx.insert(cashbookEntriesTable).values({
          date: d.date!, type: "cash_out", source: "purchase", referenceId: correction.id,
          description: `Purchase payment to ${s?.name ?? "supplier"}${d.invoiceNo ? ` (Inv #${d.invoiceNo})` : ""}`,
          paymentMode, amount: String(paidAmount), notes: d.notes ?? null, createdById: userId,
        });
      }

      correctionId = correction.id;
    }

    return { reversalId: reversal.id, correctionId };
  });

  const [origInv] = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, original.id));
  const [reversalInv] = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, result.reversalId));
  const correctionInv = result.correctionId != null
    ? (await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, result.correctionId)))[0]
    : null;

  const [origSupplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, origInv.supplierId));
  const [correctionSupplier] = correctionInv && correctionInv.supplierId !== origInv.supplierId
    ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, correctionInv.supplierId))
    : [origSupplier];

  res.json({
    original: toPurchaseResponse(origInv, origSupplier?.name ?? ""),
    reversal: toPurchaseResponse(reversalInv, origSupplier?.name ?? ""),
    ...(correctionInv ? { correction: toPurchaseResponse(correctionInv, correctionSupplier?.name ?? "") } : {}),
  });
});

export default router;
