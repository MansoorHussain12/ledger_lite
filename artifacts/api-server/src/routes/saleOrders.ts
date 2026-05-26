import { Router, type IRouter } from "express";
import { db, saleOrdersTable, saleOrderItemsTable, productsTable, customersTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  ListSaleOrdersQueryParams,
  CreateSaleOrderBody,
  GetSaleOrderParams,
  UpdateSaleOrderParams,
  UpdateSaleOrderBody,
  DeleteSaleOrderParams,
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
    })),
  };
}

router.get("/sale-orders", requireAuth, async (req, res): Promise<void> => {
  const query = ListSaleOrdersQueryParams.safeParse(req.query);
  const conditions = [];
  if (query.success) {
    if (query.data.customerId) conditions.push(eq(saleOrdersTable.customerId, query.data.customerId));
    if (query.data.from) conditions.push(gte(saleOrdersTable.date, String(query.data.from)));
    if (query.data.to) conditions.push(lte(saleOrdersTable.date, String(query.data.to)));
  }
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
      })),
    };
  }));
  res.json(result);
});

router.post("/sale-orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSaleOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { customerId, date, vehicleNo, driverName, billtyNo, notes, items } = parsed.data;

  // Resolve rates for items
  let totalAmount = 0;
  const resolvedItems = await Promise.all(items.map(async (item) => {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    const rate = item.rate ?? (product ? parseFloat(product.currentRate) : 0);
    const amount = parseFloat(String(item.qty)) * rate;
    totalAmount += amount;
    return { productId: item.productId, qty: String(item.qty), rate: String(rate), amount: String(amount) };
  }));

  const [order] = await db.insert(saleOrdersTable).values({
    customerId, date: String(date), vehicleNo: vehicleNo ?? null, driverName: driverName ?? null,
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

router.patch("/sale-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateSaleOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateSaleOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.date != null) updates.date = parsed.data.date;
  if (parsed.data.vehicleNo !== undefined) updates.vehicleNo = parsed.data.vehicleNo ?? null;
  if (parsed.data.driverName !== undefined) updates.driverName = parsed.data.driverName ?? null;
  if (parsed.data.billtyNo !== undefined) updates.billtyNo = parsed.data.billtyNo ?? null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;

  if (parsed.data.items) {
    await db.delete(saleOrderItemsTable).where(eq(saleOrderItemsTable.saleOrderId, params.data.id));
    let totalAmount = 0;
    for (const item of parsed.data.items) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
      const rate = item.rate ?? (product ? parseFloat(product.currentRate) : 0);
      const amount = parseFloat(String(item.qty)) * rate;
      totalAmount += amount;
      await db.insert(saleOrderItemsTable).values({ saleOrderId: params.data.id, productId: item.productId, qty: String(item.qty), rate: String(rate), amount: String(amount) });
    }
    updates.totalAmount = String(totalAmount);
  }

  await db.update(saleOrdersTable).set(updates).where(eq(saleOrdersTable.id, params.data.id));
  const response = await buildSaleOrderResponse(params.data.id);
  if (!response) { res.status(404).json({ error: "Sale order not found" }); return; }
  res.json(response);
});

router.delete("/sale-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteSaleOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(saleOrdersTable).where(eq(saleOrdersTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
