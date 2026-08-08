import { Router, type IRouter } from "express";
import { db, saleOrdersTable, saleOrderItemsTable, productsTable, customersTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

// Zod coerces date strings to JS Date objects. Format them back to YYYY-MM-DD for Postgres.
function toDateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}
import {
  CreateSaleOrderBody,
  GetSaleOrderParams,
  CorrectSaleOrderParams,
  CorrectSaleOrderBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function buildSaleOrderResponse(orderId: number) {
  const [order] = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, orderId));
  if (!order) return null;
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId));
  const items = await db
    .select({ item: saleOrderItemsTable, product: productsTable })
    .from(saleOrderItemsTable)
    .leftJoin(productsTable, eq(saleOrderItemsTable.productId, productsTable.id))
    .where(eq(saleOrderItemsTable.saleOrderId, orderId));

  return {
    id: order.id, customerId: order.customerId, customerName: customer?.name ?? "",
    date: order.date, vehicleNo: order.vehicleNo ?? null, driverName: order.driverName ?? null,
    billtyNo: order.billtyNo ?? null, totalAmount: parseFloat(order.totalAmount),
    notes: order.notes ?? null, createdAt: order.createdAt,
    items: items.map(({ item, product }) => ({
      id: item.id, productId: item.productId, productName: product?.name ?? "",
      qty: parseFloat(item.qty), rate: parseFloat(item.rate), amount: parseFloat(item.amount),
      notes: item.notes ?? null,
      costPrice: item.costPrice != null ? parseFloat(item.costPrice) : null,
    })),
    status: order.status, reversesId: order.reversesId ?? null, correctsId: order.correctsId ?? null,
  };
}

// Shared by POST /sale-orders and the reversal-and-replace step of /correct — resolves
// each line item's rate/cost-price snapshot and the order's total.
async function resolveItems(items: { productId: number; qty: number; rate?: number; notes?: string }[]) {
  let totalAmount = 0;
  const resolved = await Promise.all(items.map(async (item) => {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    const rate = item.rate ?? (product ? parseFloat(product.currentRate) : 0);
    const amount = parseFloat(String(item.qty)) * rate;
    totalAmount += amount;
    // Snapshot the product's cost price at sale time — frozen from here on, even if
    // the product's cost price changes later (see costPrice column comment).
    const costPrice = product?.costPrice ?? null;
    return { productId: item.productId, qty: String(item.qty), rate: String(rate), amount: String(amount), notes: item.notes ?? null, costPrice };
  }));
  return { resolved, totalAmount };
}

router.get("/sale-orders", requireAuth, async (req, res): Promise<void> => {
  // Read filters straight from the raw query string rather than the generated
  // ListSaleOrdersQueryParams.safeParse(): its `from`/`to` fields are typed zod.date()
  // (not coerce.date()), so an ordinary query-string date value always fails
  // validation — which used to silently drop *every* filter (including customerId),
  // not just the date filter, the moment a date range was present.
  const conditions = [];
  if (req.query.customerId) conditions.push(eq(saleOrdersTable.customerId, Number(req.query.customerId)));
  if (req.query.from) conditions.push(gte(saleOrdersTable.date, String(req.query.from)));
  if (req.query.to) conditions.push(lte(saleOrdersTable.date, String(req.query.to)));
  // Default to only "live" rows — reversed originals and reversal paper-trail rows
  // are excluded unless explicitly asked for (see the correction workflow).
  if (req.query.includeReversed !== "true") conditions.push(eq(saleOrdersTable.status, "posted"));
  const orders = await db.select().from(saleOrdersTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(saleOrdersTable.date));

  const result = await Promise.all(orders.map(async (o) => {
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, o.customerId));
    const items = await db
      .select({ item: saleOrderItemsTable, product: productsTable })
      .from(saleOrderItemsTable)
      .leftJoin(productsTable, eq(saleOrderItemsTable.productId, productsTable.id))
      .where(eq(saleOrderItemsTable.saleOrderId, o.id));
    return {
      id: o.id, customerId: o.customerId, customerName: customer?.name ?? "",
      date: o.date, vehicleNo: o.vehicleNo ?? null, driverName: o.driverName ?? null,
      billtyNo: o.billtyNo ?? null, totalAmount: parseFloat(o.totalAmount),
      notes: o.notes ?? null, createdAt: o.createdAt,
      items: items.map(({ item, product }) => ({
        id: item.id, productId: item.productId, productName: product?.name ?? "",
        qty: parseFloat(item.qty), rate: parseFloat(item.rate), amount: parseFloat(item.amount),
        notes: item.notes ?? null,
        costPrice: item.costPrice != null ? parseFloat(item.costPrice) : null,
      })),
      status: o.status, reversesId: o.reversesId ?? null, correctsId: o.correctsId ?? null,
    };
  }));
  res.json(result);
});

router.post("/sale-orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSaleOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { customerId, date, vehicleNo, driverName, billtyNo, notes, items } = parsed.data;
  const { resolved: resolvedItems, totalAmount } = await resolveItems(items);

  const [order] = await db.insert(saleOrdersTable).values({
    customerId, date: toDateStr(date), vehicleNo: vehicleNo ?? null, driverName: driverName ?? null,
    billtyNo: billtyNo ?? null, notes: notes ?? null, totalAmount: String(totalAmount),
  }).returning();

  for (const item of resolvedItems) {
    await db.insert(saleOrderItemsTable).values({ saleOrderId: order.id, ...item });
  }

  const response = await buildSaleOrderResponse(order.id);
  res.status(201).json(response);
});

router.get("/sale-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSaleOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const response = await buildSaleOrderResponse(params.data.id);
  if (!response) { res.status(404).json({ error: "Sale order not found" }); return; }
  res.json(response);
});

// Correction workflow — see lib/db/src/schema/saleOrders.ts for the full design.
// A posted sale order is never edited or deleted in place. This either:
//   - reverses it with no replacement (void: true — a pure duplicate/mistake), or
//   - reverses it and posts a new corrected order in its place (default).
// Both cases: the original's *only* mutation is status posted -> reversed; a mirror
// "reversal" row is inserted (same items) to cancel it; the correction (if any) is a
// brand-new row, linked back via correctsId.
router.post("/sale-orders/:id/correct", requireRole("owner"), async (req, res): Promise<void> => {
  const params = CorrectSaleOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CorrectSaleOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [original] = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, params.data.id));
  if (!original) { res.status(404).json({ error: "Sale order not found" }); return; }
  if (original.status !== "posted") {
    res.status(409).json({ error: `This order is already ${original.status} — correct its replacement instead, not this row.` });
    return;
  }

  const isVoid = parsed.data.void === true;
  if (!isVoid && (parsed.data.customerId == null || parsed.data.date == null || !parsed.data.items?.length)) {
    res.status(400).json({ error: "customerId, date, and items are required unless void=true" });
    return;
  }

  const originalItems = await db.select().from(saleOrderItemsTable).where(eq(saleOrderItemsTable.saleOrderId, original.id));

  const result = await db.transaction(async (tx) => {
    // 1. Insert the reversal — a literal mirror of the original, for the paper trail.
    // Its notes carry the submitted correction reason (falling back to the original's
    // own notes if none given) — reversal rows are never shown directly, only surfaced
    // as the "why" behind a correction/void in the history view.
    const [reversal] = await tx.insert(saleOrdersTable).values({
      customerId: original.customerId, date: original.date, vehicleNo: original.vehicleNo,
      driverName: original.driverName, billtyNo: original.billtyNo, notes: parsed.data.reason ?? original.notes,
      totalAmount: original.totalAmount, status: "reversal", reversesId: original.id,
    }).returning();
    for (const item of originalItems) {
      await tx.insert(saleOrderItemsTable).values({
        saleOrderId: reversal.id, productId: item.productId, qty: item.qty, rate: item.rate,
        amount: item.amount, notes: item.notes, costPrice: item.costPrice,
      });
    }

    // 2. The original's only mutation, ever: flip its status. No business field changes.
    await tx.update(saleOrdersTable).set({ status: "reversed" }).where(eq(saleOrdersTable.id, original.id));

    // 3. If this is a correction (not a pure void), post the replacement.
    let correctionId: number | null = null;
    if (!isVoid) {
      const { resolved: resolvedItems, totalAmount } = await resolveItems(parsed.data.items!);
      const [correction] = await tx.insert(saleOrdersTable).values({
        customerId: parsed.data.customerId!, date: toDateStr(parsed.data.date!),
        vehicleNo: parsed.data.vehicleNo ?? null, driverName: parsed.data.driverName ?? null,
        billtyNo: parsed.data.billtyNo ?? null, notes: parsed.data.notes ?? null,
        totalAmount: String(totalAmount), status: "posted", correctsId: original.id,
      }).returning();
      for (const item of resolvedItems) {
        await tx.insert(saleOrderItemsTable).values({ saleOrderId: correction.id, ...item });
      }
      correctionId = correction.id;
    }

    return { reversalId: reversal.id, correctionId };
  });

  const [originalResp, reversalResp, correctionResp] = await Promise.all([
    buildSaleOrderResponse(original.id),
    buildSaleOrderResponse(result.reversalId),
    result.correctionId != null ? buildSaleOrderResponse(result.correctionId) : Promise.resolve(null),
  ]);

  res.json({
    original: originalResp, reversal: reversalResp,
    ...(correctionResp ? { correction: correctionResp } : {}),
  });
});

export default router;
