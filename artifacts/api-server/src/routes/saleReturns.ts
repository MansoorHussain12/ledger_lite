import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  saleReturnsTable,
  saleReturnItemsTable,
  saleOrdersTable,
  saleOrderItemsTable,
  customersTable,
  productsTable,
  cashbookEntriesTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// Thrown from inside a transaction to abort it and report a specific HTTP status —
// the surrounding handler catches this and responds, letting anything else propagate
// as a genuine 500.
class ReturnValidationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toSaleReturnRowResponse(r: typeof saleReturnsTable.$inferSelect, customerName: string) {
  return {
    id: r.id, saleOrderId: r.saleOrderId, customerId: r.customerId, customerName,
    date: r.date, totalAmount: parseFloat(r.totalAmount), refundPaid: parseFloat(r.refundPaid),
    refundMode: r.refundMode, reason: r.reason ?? null, notes: r.notes ?? null, createdAt: r.createdAt,
    status: r.status, reversesId: r.reversesId ?? null, correctsId: r.correctsId ?? null,
  };
}

async function getSaleReturnItems(saleReturnId: number) {
  const items = await db.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.saleReturnId, saleReturnId));
  return Promise.all(items.map(async (item) => {
    const [p] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    return {
      id: item.id, saleOrderItemId: item.saleOrderItemId, productId: item.productId, productName: p?.name ?? "",
      qty: parseFloat(item.qty), rate: parseFloat(item.rate), amount: parseFloat(item.amount),
      costPrice: item.costPrice != null ? parseFloat(item.costPrice) : null, notes: item.notes ?? null,
    };
  }));
}

async function buildSaleReturnResponse(id: number) {
  const [r] = await db.select().from(saleReturnsTable).where(eq(saleReturnsTable.id, id));
  if (!r) return null;
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, r.customerId));
  const items = await getSaleReturnItems(id);
  return { ...toSaleReturnRowResponse(r, customer?.name ?? ""), items };
}

// ── helper: returnable qty per sale order item ────────────────────────────────
// Same posted-status-filtered netting pattern as calcStock (inventory.ts) — a reversed
// return and its reversal mirror are both excluded, so a corrected/voided return frees
// its qty back up automatically rather than needing special-casing here.

async function getReturnableSaleOrderItems(saleOrderId: number) {
  const items = await db.select().from(saleOrderItemsTable).where(eq(saleOrderItemsTable.saleOrderId, saleOrderId));
  return Promise.all(items.map(async (item) => {
    const [agg] = await db
      .select({ total: sql<string>`coalesce(sum(${saleReturnItemsTable.qty}),0)` })
      .from(saleReturnItemsTable)
      .innerJoin(saleReturnsTable, eq(saleReturnItemsTable.saleReturnId, saleReturnsTable.id))
      .where(and(eq(saleReturnItemsTable.saleOrderItemId, item.id), eq(saleReturnsTable.status, "posted")));
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    const originalQty = parseFloat(item.qty);
    const alreadyReturnedQty = parseFloat(agg?.total ?? "0");
    return {
      saleOrderItemId: item.id,
      productId: item.productId,
      productName: product?.name ?? "",
      unit: product?.unit ?? null,
      originalQty,
      rate: parseFloat(item.rate),
      costPrice: item.costPrice != null ? parseFloat(item.costPrice) : null,
      alreadyReturnedQty,
      returnableQty: Math.max(0, Math.round((originalQty - alreadyReturnedQty) * 100) / 100),
    };
  }));
}

// ── GET /sale-returns/eligible/:saleOrderId ────────────────────────────────────

router.get("/sale-returns/eligible/:saleOrderId", requireAuth, async (req, res): Promise<void> => {
  const saleOrderId = parseInt(String(req.params.saleOrderId), 10);
  if (isNaN(saleOrderId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [order] = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, saleOrderId));
  if (!order) { res.status(404).json({ error: "Sale order not found" }); return; }
  if (order.status !== "posted") {
    res.status(409).json({ error: "This sale order is not currently posted — returns can only be made against a live order." });
    return;
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId));
  const orderItems = await db
    .select({ item: saleOrderItemsTable, product: productsTable })
    .from(saleOrderItemsTable)
    .leftJoin(productsTable, eq(saleOrderItemsTable.productId, productsTable.id))
    .where(eq(saleOrderItemsTable.saleOrderId, saleOrderId));
  const items = await getReturnableSaleOrderItems(saleOrderId);

  res.json({
    saleOrder: {
      id: order.id, customerId: order.customerId, customerName: customer?.name ?? "",
      date: order.date, vehicleNo: order.vehicleNo ?? null, driverName: order.driverName ?? null,
      billtyNo: order.billtyNo ?? null, totalAmount: parseFloat(order.totalAmount),
      notes: order.notes ?? null, createdAt: order.createdAt,
      items: orderItems.map(({ item, product }) => ({
        id: item.id, productId: item.productId, productName: product?.name ?? "",
        qty: parseFloat(item.qty), rate: parseFloat(item.rate), amount: parseFloat(item.amount),
        notes: item.notes ?? null, costPrice: item.costPrice != null ? parseFloat(item.costPrice) : null,
      })),
      status: order.status, reversesId: order.reversesId ?? null, correctsId: order.correctsId ?? null,
    },
    items,
  });
});

// ── GET /sale-returns ────────────────────────────────────────────────────────

router.get("/sale-returns", requireAuth, async (req, res): Promise<void> => {
  const conditions = [];
  if (req.query.saleOrderId) conditions.push(eq(saleReturnsTable.saleOrderId, Number(req.query.saleOrderId)));
  if (req.query.customerId) conditions.push(eq(saleReturnsTable.customerId, Number(req.query.customerId)));
  if (req.query.from) conditions.push(gte(saleReturnsTable.date, String(req.query.from)));
  if (req.query.to) conditions.push(lte(saleReturnsTable.date, String(req.query.to)));
  // Default to only "live" rows — reversed originals and reversal paper-trail rows are
  // excluded unless explicitly asked for (see the correction workflow).
  if (req.query.includeReversed !== "true") conditions.push(eq(saleReturnsTable.status, "posted"));

  const rows = await db.select().from(saleReturnsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(saleReturnsTable.date), desc(saleReturnsTable.id));

  const result = await Promise.all(rows.map(async (r) => {
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, r.customerId));
    return toSaleReturnRowResponse(r, customer?.name ?? "");
  }));
  res.json(result);
});

// ── POST /sale-returns ─────────────────────────────────────────────────────────

const saleReturnItemInputSchema = z.object({
  saleOrderItemId: z.number().int().positive(),
  qty: z.coerce.number().positive(),
  notes: z.string().optional(),
});

const saleReturnInputSchema = z.object({
  saleOrderId: z.number().int().positive(),
  date: z.string().min(1),
  items: z.array(saleReturnItemInputSchema).min(1),
  refundPaid: z.coerce.number().min(0).optional().default(0),
  refundMode: z.enum(["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"]).default("cash"),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/sale-returns", requireAuth, async (req, res): Promise<void> => {
  const parsed = saleReturnInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const d = parsed.data;
  const userId = (req.session as any)?.userId ?? null;

  const [order] = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, d.saleOrderId));
  if (!order) { res.status(404).json({ error: "Sale order not found" }); return; }
  if (order.status !== "posted") {
    res.status(409).json({ error: "This sale order is not currently posted — returns can only be made against a live order." });
    return;
  }

  try {
    const created = await db.transaction(async (tx) => {
      // Re-check returnable qty inside the transaction (not just via the /eligible
      // endpoint the UI already called) so two concurrent returns against the same
      // order can't both succeed and over-return.
      const orderItems = await tx.select().from(saleOrderItemsTable).where(eq(saleOrderItemsTable.saleOrderId, d.saleOrderId));
      const orderItemMap = new Map(orderItems.map(i => [i.id, i]));

      const itemsWithAmount = await Promise.all(d.items.map(async (input) => {
        const original = orderItemMap.get(input.saleOrderItemId);
        if (!original) throw new ReturnValidationError(400, `Item ${input.saleOrderItemId} does not belong to sale order ${d.saleOrderId}`);

        const [agg] = await tx
          .select({ total: sql<string>`coalesce(sum(${saleReturnItemsTable.qty}),0)` })
          .from(saleReturnItemsTable)
          .innerJoin(saleReturnsTable, eq(saleReturnItemsTable.saleReturnId, saleReturnsTable.id))
          .where(and(eq(saleReturnItemsTable.saleOrderItemId, original.id), eq(saleReturnsTable.status, "posted")));
        const alreadyReturned = parseFloat(agg?.total ?? "0");
        const returnable = Math.max(0, parseFloat(original.qty) - alreadyReturned);
        if (input.qty > returnable) {
          const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, original.productId));
          throw new ReturnValidationError(400, `Cannot return ${input.qty} of "${product?.name ?? "item"}" — only ${Math.round(returnable * 100) / 100} remaining returnable`);
        }

        const rate = parseFloat(original.rate);
        const amount = Math.round(input.qty * rate * 100) / 100;
        return {
          saleOrderItemId: original.id, productId: original.productId, qty: input.qty, rate, amount,
          costPrice: original.costPrice, notes: input.notes ?? null,
        };
      }));

      const totalAmount = itemsWithAmount.reduce((s, i) => s + i.amount, 0);
      const refundPaid = Math.min(d.refundPaid ?? 0, totalAmount);

      const [ret] = await tx.insert(saleReturnsTable).values({
        saleOrderId: d.saleOrderId, customerId: order.customerId, date: d.date,
        totalAmount: String(totalAmount), refundPaid: String(refundPaid), refundMode: d.refundMode,
        reason: d.reason ?? null, notes: d.notes ?? null, createdById: userId,
      }).returning();

      await tx.insert(saleReturnItemsTable).values(
        itemsWithAmount.map(item => ({
          saleReturnId: ret.id, saleOrderItemId: item.saleOrderItemId, productId: item.productId,
          qty: String(item.qty), rate: String(item.rate), amount: String(item.amount),
          costPrice: item.costPrice, notes: item.notes,
        }))
      );

      if (refundPaid > 0) {
        const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, order.customerId));
        await tx.insert(cashbookEntriesTable).values({
          date: d.date, type: "cash_out", source: "sale_return", referenceId: ret.id,
          description: `Sale return refund to ${customer?.name ?? "customer"} (SO-${d.saleOrderId})`,
          paymentMode: d.refundMode, amount: String(refundPaid), notes: d.reason ?? null, createdById: userId,
        });
      }

      return ret;
    });

    const response = await buildSaleReturnResponse(created.id);
    res.status(201).json(response);
  } catch (e) {
    if (e instanceof ReturnValidationError) { res.status(e.status).json({ error: e.message }); return; }
    throw e;
  }
});

// ── GET /sale-returns/:id ──────────────────────────────────────────────────────

router.get("/sale-returns/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const response = await buildSaleReturnResponse(id);
  if (!response) { res.status(404).json({ error: "Sale return not found" }); return; }
  res.json(response);
});

// ── POST /sale-returns/:id/correct ──────────────────────────────────────────────
// Correction workflow — see lib/db/src/schema/saleOrders.ts for the full design. A
// posted sale return is never edited or deleted in place. This either reverses it with
// no replacement (void: true), or reverses it and posts a new corrected return in its
// place (default) — and in both cases correctly reverses/reposts the return's
// auto-posted cashbook refund entry. saleOrderId cannot change in a correction — only
// which/how much of that order's items are returned, and the refund.

const saleReturnCorrectionSchema = z.object({
  void: z.boolean().optional(),
  reason: z.string().optional(),
  items: z.array(saleReturnItemInputSchema).optional(),
  refundPaid: z.coerce.number().min(0).optional(),
  refundMode: z.enum(["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"]).optional(),
  notes: z.string().optional(),
});

router.post("/sale-returns/:id/correct", requireRole("owner"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = saleReturnCorrectionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const d = parsed.data;

  const [original] = await db.select().from(saleReturnsTable).where(eq(saleReturnsTable.id, id));
  if (!original) { res.status(404).json({ error: "Sale return not found" }); return; }
  if (original.status !== "posted") {
    res.status(409).json({ error: `This return is already ${original.status} — correct its replacement instead, not this row.` });
    return;
  }

  const isVoid = d.void === true;
  if (!isVoid && !d.items?.length) {
    res.status(400).json({ error: "items are required unless void=true" });
    return;
  }

  const originalItems = await db.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.saleReturnId, original.id));
  const userId = (req.session as any)?.userId ?? null;

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Insert the reversal — a literal mirror of the original, for the paper trail.
      const [reversal] = await tx.insert(saleReturnsTable).values({
        saleOrderId: original.saleOrderId, customerId: original.customerId, date: original.date,
        totalAmount: original.totalAmount, refundPaid: original.refundPaid, refundMode: original.refundMode,
        reason: d.reason ?? original.reason, notes: original.notes, createdById: original.createdById,
        status: "reversal", reversesId: original.id,
      }).returning();
      for (const item of originalItems) {
        await tx.insert(saleReturnItemsTable).values({
          saleReturnId: reversal.id, saleOrderItemId: item.saleOrderItemId, productId: item.productId,
          qty: item.qty, rate: item.rate, amount: item.amount, costPrice: item.costPrice, notes: item.notes,
        });
      }

      // 2. Reverse the cashbook entry this return originally auto-posted (if still live —
      // tolerate it being missing/already-reversed rather than failing the whole correction).
      const [linkedCashbookEntry] = await tx.select().from(cashbookEntriesTable)
        .where(and(eq(cashbookEntriesTable.source, "sale_return"), eq(cashbookEntriesTable.referenceId, original.id), eq(cashbookEntriesTable.status, "posted")));
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
      await tx.update(saleReturnsTable).set({ status: "reversed" }).where(eq(saleReturnsTable.id, original.id));

      // 4. If this is a correction (not a pure void), re-validate against returnable qty
      // (now correctly excluding the just-reversed original, since step 3 already ran)
      // and post the replacement return + its own fresh cashbook entry.
      let correctionId: number | null = null;
      if (!isVoid) {
        const orderItems = await tx.select().from(saleOrderItemsTable).where(eq(saleOrderItemsTable.saleOrderId, original.saleOrderId));
        const orderItemMap = new Map(orderItems.map(i => [i.id, i]));

        const itemsWithAmount = await Promise.all(d.items!.map(async (input) => {
          const orig = orderItemMap.get(input.saleOrderItemId);
          if (!orig) throw new ReturnValidationError(400, `Item ${input.saleOrderItemId} does not belong to sale order ${original.saleOrderId}`);

          const [agg] = await tx
            .select({ total: sql<string>`coalesce(sum(${saleReturnItemsTable.qty}),0)` })
            .from(saleReturnItemsTable)
            .innerJoin(saleReturnsTable, eq(saleReturnItemsTable.saleReturnId, saleReturnsTable.id))
            .where(and(eq(saleReturnItemsTable.saleOrderItemId, orig.id), eq(saleReturnsTable.status, "posted")));
          const alreadyReturned = parseFloat(agg?.total ?? "0");
          const returnable = Math.max(0, parseFloat(orig.qty) - alreadyReturned);
          if (input.qty > returnable) {
            const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, orig.productId));
            throw new ReturnValidationError(400, `Cannot return ${input.qty} of "${product?.name ?? "item"}" — only ${Math.round(returnable * 100) / 100} remaining returnable`);
          }

          const rate = parseFloat(orig.rate);
          const amount = Math.round(input.qty * rate * 100) / 100;
          return {
            saleOrderItemId: orig.id, productId: orig.productId, qty: input.qty, rate, amount,
            costPrice: orig.costPrice, notes: input.notes ?? null,
          };
        }));

        const totalAmount = itemsWithAmount.reduce((s, i) => s + i.amount, 0);
        const refundPaid = Math.min(d.refundPaid ?? 0, totalAmount);
        const refundMode = d.refundMode ?? original.refundMode;

        const [correction] = await tx.insert(saleReturnsTable).values({
          saleOrderId: original.saleOrderId, customerId: original.customerId, date: original.date,
          totalAmount: String(totalAmount), refundPaid: String(refundPaid), refundMode,
          reason: d.reason ?? null, notes: d.notes ?? null, createdById: userId,
          status: "posted", correctsId: original.id,
        }).returning();
        await tx.insert(saleReturnItemsTable).values(
          itemsWithAmount.map(item => ({
            saleReturnId: correction.id, saleOrderItemId: item.saleOrderItemId, productId: item.productId,
            qty: String(item.qty), rate: String(item.rate), amount: String(item.amount),
            costPrice: item.costPrice, notes: item.notes,
          }))
        );

        if (refundPaid > 0) {
          const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, original.customerId));
          await tx.insert(cashbookEntriesTable).values({
            date: original.date, type: "cash_out", source: "sale_return", referenceId: correction.id,
            description: `Sale return refund to ${customer?.name ?? "customer"} (SO-${original.saleOrderId})`,
            paymentMode: refundMode, amount: String(refundPaid), notes: d.notes ?? null, createdById: userId,
          });
        }

        correctionId = correction.id;
      }

      return { reversalId: reversal.id, correctionId };
    });

    const [originalResp, reversalResp, correctionResp] = await Promise.all([
      buildSaleReturnResponse(original.id),
      buildSaleReturnResponse(result.reversalId),
      result.correctionId != null ? buildSaleReturnResponse(result.correctionId) : Promise.resolve(null),
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
