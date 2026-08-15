import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  purchaseReturnsTable,
  purchaseReturnItemsTable,
  purchaseInvoicesTable,
  purchaseInvoiceItemsTable,
  suppliersTable,
  productsTable,
  cashbookEntriesTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// Thrown from inside a transaction to abort it and report a specific HTTP status — see
// saleReturns.ts's identical class for the full rationale.
class ReturnValidationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toPurchaseReturnRowResponse(r: typeof purchaseReturnsTable.$inferSelect, supplierName: string) {
  return {
    id: r.id, purchaseInvoiceId: r.purchaseInvoiceId, supplierId: r.supplierId, supplierName,
    date: r.date, totalAmount: parseFloat(r.totalAmount), refundReceived: parseFloat(r.refundReceived),
    refundMode: r.refundMode, reason: r.reason ?? null, notes: r.notes ?? null, createdAt: r.createdAt,
    status: r.status, reversesId: r.reversesId ?? null, correctsId: r.correctsId ?? null,
  };
}

async function getPurchaseReturnItems(purchaseReturnId: number) {
  const items = await db.select().from(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.purchaseReturnId, purchaseReturnId));
  return Promise.all(items.map(async (item) => {
    const [p] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    return {
      id: item.id, purchaseInvoiceItemId: item.purchaseInvoiceItemId, productId: item.productId, productName: p?.name ?? "",
      qty: parseFloat(item.qty), rate: parseFloat(item.rate), amount: parseFloat(item.amount), notes: item.notes ?? null,
    };
  }));
}

async function buildPurchaseReturnResponse(id: number) {
  const [r] = await db.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
  if (!r) return null;
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, r.supplierId));
  const items = await getPurchaseReturnItems(id);
  return { ...toPurchaseReturnRowResponse(r, supplier?.name ?? ""), items };
}

// ── helper: returnable qty per purchase invoice item ────────────────────────────
// Same posted-status-filtered netting pattern as calcStock (inventory.ts).

async function getReturnablePurchaseInvoiceItems(purchaseInvoiceId: number) {
  const items = await db.select().from(purchaseInvoiceItemsTable).where(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, purchaseInvoiceId));
  return Promise.all(items.map(async (item) => {
    const [agg] = await db
      .select({ total: sql<string>`coalesce(sum(${purchaseReturnItemsTable.qty}),0)` })
      .from(purchaseReturnItemsTable)
      .innerJoin(purchaseReturnsTable, eq(purchaseReturnItemsTable.purchaseReturnId, purchaseReturnsTable.id))
      .where(and(eq(purchaseReturnItemsTable.purchaseInvoiceItemId, item.id), eq(purchaseReturnsTable.status, "posted")));
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    const originalQty = parseFloat(item.qty);
    const alreadyReturnedQty = parseFloat(agg?.total ?? "0");
    return {
      purchaseInvoiceItemId: item.id,
      productId: item.productId,
      productName: product?.name ?? "",
      unit: product?.unit ?? null,
      originalQty,
      rate: parseFloat(item.rate),
      alreadyReturnedQty,
      returnableQty: Math.max(0, Math.round((originalQty - alreadyReturnedQty) * 100) / 100),
    };
  }));
}

// ── GET /purchase-returns/eligible/:purchaseInvoiceId ────────────────────────────

router.get("/purchase-returns/eligible/:purchaseInvoiceId", requireAuth, async (req, res): Promise<void> => {
  const purchaseInvoiceId = parseInt(String(req.params.purchaseInvoiceId), 10);
  if (isNaN(purchaseInvoiceId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [inv] = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, purchaseInvoiceId));
  if (!inv) { res.status(404).json({ error: "Purchase invoice not found" }); return; }
  if (inv.status !== "posted") {
    res.status(409).json({ error: "This purchase invoice is not currently posted — returns can only be made against a live invoice." });
    return;
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, inv.supplierId));
  const items = await getReturnablePurchaseInvoiceItems(purchaseInvoiceId);

  res.json({
    purchaseInvoice: {
      id: inv.id, supplierId: inv.supplierId, supplierName: supplier?.name ?? "",
      date: inv.date, invoiceNo: inv.invoiceNo ?? null, totalAmount: parseFloat(inv.totalAmount),
      paidAmount: parseFloat(inv.paidAmount), balance: parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount),
      paymentMode: inv.paymentMode, notes: inv.notes ?? null, createdAt: inv.createdAt,
      status: inv.status, reversesId: inv.reversesId ?? null, correctsId: inv.correctsId ?? null,
    },
    items,
  });
});

// ── GET /purchase-returns ────────────────────────────────────────────────────────

router.get("/purchase-returns", requireAuth, async (req, res): Promise<void> => {
  const conditions = [];
  if (req.query.purchaseInvoiceId) conditions.push(eq(purchaseReturnsTable.purchaseInvoiceId, Number(req.query.purchaseInvoiceId)));
  if (req.query.supplierId) conditions.push(eq(purchaseReturnsTable.supplierId, Number(req.query.supplierId)));
  if (req.query.from) conditions.push(gte(purchaseReturnsTable.date, String(req.query.from)));
  if (req.query.to) conditions.push(lte(purchaseReturnsTable.date, String(req.query.to)));
  if (req.query.includeReversed !== "true") conditions.push(eq(purchaseReturnsTable.status, "posted"));

  const rows = await db.select().from(purchaseReturnsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(purchaseReturnsTable.date), desc(purchaseReturnsTable.id));

  const result = await Promise.all(rows.map(async (r) => {
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, r.supplierId));
    return toPurchaseReturnRowResponse(r, supplier?.name ?? "");
  }));
  res.json(result);
});

// ── POST /purchase-returns ─────────────────────────────────────────────────────────

const purchaseReturnItemInputSchema = z.object({
  purchaseInvoiceItemId: z.number().int().positive(),
  qty: z.coerce.number().positive(),
  notes: z.string().optional(),
});

const purchaseReturnInputSchema = z.object({
  purchaseInvoiceId: z.number().int().positive(),
  date: z.string().min(1),
  items: z.array(purchaseReturnItemInputSchema).min(1),
  refundReceived: z.coerce.number().min(0).optional().default(0),
  refundMode: z.enum(["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"]).default("cash"),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/purchase-returns", requireAuth, async (req, res): Promise<void> => {
  const parsed = purchaseReturnInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const d = parsed.data;
  const userId = (req.session as any)?.userId ?? null;

  const [inv] = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, d.purchaseInvoiceId));
  if (!inv) { res.status(404).json({ error: "Purchase invoice not found" }); return; }
  if (inv.status !== "posted") {
    res.status(409).json({ error: "This purchase invoice is not currently posted — returns can only be made against a live invoice." });
    return;
  }

  try {
    const created = await db.transaction(async (tx) => {
      // Re-check returnable qty inside the transaction — see saleReturns.ts's identical
      // rationale (protects against two concurrent returns over-returning together).
      const invItems = await tx.select().from(purchaseInvoiceItemsTable).where(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, d.purchaseInvoiceId));
      const invItemMap = new Map(invItems.map(i => [i.id, i]));

      const itemsWithAmount = await Promise.all(d.items.map(async (input) => {
        const original = invItemMap.get(input.purchaseInvoiceItemId);
        if (!original) throw new ReturnValidationError(400, `Item ${input.purchaseInvoiceItemId} does not belong to purchase invoice ${d.purchaseInvoiceId}`);

        const [agg] = await tx
          .select({ total: sql<string>`coalesce(sum(${purchaseReturnItemsTable.qty}),0)` })
          .from(purchaseReturnItemsTable)
          .innerJoin(purchaseReturnsTable, eq(purchaseReturnItemsTable.purchaseReturnId, purchaseReturnsTable.id))
          .where(and(eq(purchaseReturnItemsTable.purchaseInvoiceItemId, original.id), eq(purchaseReturnsTable.status, "posted")));
        const alreadyReturned = parseFloat(agg?.total ?? "0");
        const returnable = Math.max(0, parseFloat(original.qty) - alreadyReturned);
        if (input.qty > returnable) {
          const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, original.productId));
          throw new ReturnValidationError(400, `Cannot return ${input.qty} of "${product?.name ?? "item"}" — only ${Math.round(returnable * 100) / 100} remaining returnable`);
        }

        const rate = parseFloat(original.rate);
        const amount = Math.round(input.qty * rate * 100) / 100;
        return {
          purchaseInvoiceItemId: original.id, productId: original.productId, qty: input.qty, rate, amount,
          notes: input.notes ?? null,
        };
      }));

      const totalAmount = itemsWithAmount.reduce((s, i) => s + i.amount, 0);
      const refundReceived = Math.min(d.refundReceived ?? 0, totalAmount);

      const [ret] = await tx.insert(purchaseReturnsTable).values({
        purchaseInvoiceId: d.purchaseInvoiceId, supplierId: inv.supplierId, date: d.date,
        totalAmount: String(totalAmount), refundReceived: String(refundReceived), refundMode: d.refundMode,
        reason: d.reason ?? null, notes: d.notes ?? null, createdById: userId,
      }).returning();

      await tx.insert(purchaseReturnItemsTable).values(
        itemsWithAmount.map(item => ({
          purchaseReturnId: ret.id, purchaseInvoiceItemId: item.purchaseInvoiceItemId, productId: item.productId,
          qty: String(item.qty), rate: String(item.rate), amount: String(item.amount), notes: item.notes,
        }))
      );

      if (refundReceived > 0) {
        const [supplier] = await tx.select().from(suppliersTable).where(eq(suppliersTable.id, inv.supplierId));
        await tx.insert(cashbookEntriesTable).values({
          date: d.date, type: "cash_in", source: "purchase_return", referenceId: ret.id,
          description: `Purchase return refund from ${supplier?.name ?? "supplier"} (PUR-${d.purchaseInvoiceId})`,
          paymentMode: d.refundMode, amount: String(refundReceived), notes: d.reason ?? null, createdById: userId,
        });
      }

      return ret;
    });

    const response = await buildPurchaseReturnResponse(created.id);
    res.status(201).json(response);
  } catch (e) {
    if (e instanceof ReturnValidationError) { res.status(e.status).json({ error: e.message }); return; }
    throw e;
  }
});

// ── GET /purchase-returns/:id ──────────────────────────────────────────────────────

router.get("/purchase-returns/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const response = await buildPurchaseReturnResponse(id);
  if (!response) { res.status(404).json({ error: "Purchase return not found" }); return; }
  res.json(response);
});

// ── POST /purchase-returns/:id/correct ──────────────────────────────────────────────
// Correction workflow — mirrors sale-returns.ts exactly, signs flipped: the refund is a
// cash_in reversed/reposted the same way. purchaseInvoiceId cannot change in a correction.

const purchaseReturnCorrectionSchema = z.object({
  void: z.boolean().optional(),
  reason: z.string().optional(),
  items: z.array(purchaseReturnItemInputSchema).optional(),
  refundReceived: z.coerce.number().min(0).optional(),
  refundMode: z.enum(["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"]).optional(),
  notes: z.string().optional(),
});

router.post("/purchase-returns/:id/correct", requireRole("owner"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = purchaseReturnCorrectionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const d = parsed.data;

  const [original] = await db.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
  if (!original) { res.status(404).json({ error: "Purchase return not found" }); return; }
  if (original.status !== "posted") {
    res.status(409).json({ error: `This return is already ${original.status} — correct its replacement instead, not this row.` });
    return;
  }

  const isVoid = d.void === true;
  if (!isVoid && !d.items?.length) {
    res.status(400).json({ error: "items are required unless void=true" });
    return;
  }

  const originalItems = await db.select().from(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.purchaseReturnId, original.id));
  const userId = (req.session as any)?.userId ?? null;

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Insert the reversal — a literal mirror of the original, for the paper trail.
      const [reversal] = await tx.insert(purchaseReturnsTable).values({
        purchaseInvoiceId: original.purchaseInvoiceId, supplierId: original.supplierId, date: original.date,
        totalAmount: original.totalAmount, refundReceived: original.refundReceived, refundMode: original.refundMode,
        reason: d.reason ?? original.reason, notes: original.notes, createdById: original.createdById,
        status: "reversal", reversesId: original.id,
      }).returning();
      for (const item of originalItems) {
        await tx.insert(purchaseReturnItemsTable).values({
          purchaseReturnId: reversal.id, purchaseInvoiceItemId: item.purchaseInvoiceItemId, productId: item.productId,
          qty: item.qty, rate: item.rate, amount: item.amount, notes: item.notes,
        });
      }

      // 2. Reverse the cashbook entry this return originally auto-posted (if still live).
      const [linkedCashbookEntry] = await tx.select().from(cashbookEntriesTable)
        .where(and(eq(cashbookEntriesTable.source, "purchase_return"), eq(cashbookEntriesTable.referenceId, original.id), eq(cashbookEntriesTable.status, "posted")));
      if (linkedCashbookEntry) {
        await tx.insert(cashbookEntriesTable).values({
          date: linkedCashbookEntry.date, type: linkedCashbookEntry.type, source: linkedCashbookEntry.source,
          referenceId: linkedCashbookEntry.referenceId, description: `Reversal: ${linkedCashbookEntry.description}`,
          paymentMode: linkedCashbookEntry.paymentMode, amount: linkedCashbookEntry.amount, notes: linkedCashbookEntry.notes,
          createdById: userId, status: "reversal", reversesId: linkedCashbookEntry.id,
        });
        await tx.update(cashbookEntriesTable).set({ status: "reversed" }).where(eq(cashbookEntriesTable.id, linkedCashbookEntry.id));
      }

      // 3. The original's only mutation, ever: flip its status.
      await tx.update(purchaseReturnsTable).set({ status: "reversed" }).where(eq(purchaseReturnsTable.id, original.id));

      // 4. If this is a correction (not a pure void), re-validate against returnable qty
      // and post the replacement return + its own fresh cashbook entry.
      let correctionId: number | null = null;
      if (!isVoid) {
        const invItems = await tx.select().from(purchaseInvoiceItemsTable).where(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, original.purchaseInvoiceId));
        const invItemMap = new Map(invItems.map(i => [i.id, i]));

        const itemsWithAmount = await Promise.all(d.items!.map(async (input) => {
          const orig = invItemMap.get(input.purchaseInvoiceItemId);
          if (!orig) throw new ReturnValidationError(400, `Item ${input.purchaseInvoiceItemId} does not belong to purchase invoice ${original.purchaseInvoiceId}`);

          const [agg] = await tx
            .select({ total: sql<string>`coalesce(sum(${purchaseReturnItemsTable.qty}),0)` })
            .from(purchaseReturnItemsTable)
            .innerJoin(purchaseReturnsTable, eq(purchaseReturnItemsTable.purchaseReturnId, purchaseReturnsTable.id))
            .where(and(eq(purchaseReturnItemsTable.purchaseInvoiceItemId, orig.id), eq(purchaseReturnsTable.status, "posted")));
          const alreadyReturned = parseFloat(agg?.total ?? "0");
          const returnable = Math.max(0, parseFloat(orig.qty) - alreadyReturned);
          if (input.qty > returnable) {
            const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, orig.productId));
            throw new ReturnValidationError(400, `Cannot return ${input.qty} of "${product?.name ?? "item"}" — only ${Math.round(returnable * 100) / 100} remaining returnable`);
          }

          const rate = parseFloat(orig.rate);
          const amount = Math.round(input.qty * rate * 100) / 100;
          return {
            purchaseInvoiceItemId: orig.id, productId: orig.productId, qty: input.qty, rate, amount,
            notes: input.notes ?? null,
          };
        }));

        const totalAmount = itemsWithAmount.reduce((s, i) => s + i.amount, 0);
        const refundReceived = Math.min(d.refundReceived ?? 0, totalAmount);
        const refundMode = d.refundMode ?? original.refundMode;

        const [correction] = await tx.insert(purchaseReturnsTable).values({
          purchaseInvoiceId: original.purchaseInvoiceId, supplierId: original.supplierId, date: original.date,
          totalAmount: String(totalAmount), refundReceived: String(refundReceived), refundMode,
          reason: d.reason ?? null, notes: d.notes ?? null, createdById: userId,
          status: "posted", correctsId: original.id,
        }).returning();
        await tx.insert(purchaseReturnItemsTable).values(
          itemsWithAmount.map(item => ({
            purchaseReturnId: correction.id, purchaseInvoiceItemId: item.purchaseInvoiceItemId, productId: item.productId,
            qty: String(item.qty), rate: String(item.rate), amount: String(item.amount), notes: item.notes,
          }))
        );

        if (refundReceived > 0) {
          const [supplier] = await tx.select().from(suppliersTable).where(eq(suppliersTable.id, original.supplierId));
          await tx.insert(cashbookEntriesTable).values({
            date: original.date, type: "cash_in", source: "purchase_return", referenceId: correction.id,
            description: `Purchase return refund from ${supplier?.name ?? "supplier"} (PUR-${original.purchaseInvoiceId})`,
            paymentMode: refundMode, amount: String(refundReceived), notes: d.notes ?? null, createdById: userId,
          });
        }

        correctionId = correction.id;
      }

      return { reversalId: reversal.id, correctionId };
    });

    const [originalResp, reversalResp, correctionResp] = await Promise.all([
      buildPurchaseReturnResponse(original.id),
      buildPurchaseReturnResponse(result.reversalId),
      result.correctionId != null ? buildPurchaseReturnResponse(result.correctionId) : Promise.resolve(null),
    ]);

    res.json({
      original: originalResp, reversal: reversalResp,
      ...(correctionResp ? { correction: correctionResp } : {}),
    });
  } catch (e) {
    if (e instanceof ReturnValidationError) { res.status(e.status).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
