import { Router, type IRouter } from "express";
import { db, customersTable, saleOrdersTable, saleOrderItemsTable, paymentsTable, productsTable } from "@workspace/db";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

// Shared by /dashboard/summary (todayProfit) and /dashboard/profit-breakdown, so the
// KPI card total and the drill-down dialog's grand total can never disagree.
async function getProfitBreakdownForDate(date: string) {
  // Only "live" (posted) orders — a reversed/corrected mistake is excluded, so this
  // reflects the correction, not the mistake (see the correction workflow).
  const orders = await db.select().from(saleOrdersTable).where(and(eq(saleOrdersTable.date, date), eq(saleOrdersTable.status, "posted")));

  const orderIds = orders.map(o => o.id);
  const items = orderIds.length
    ? await db.select().from(saleOrderItemsTable).where(inArray(saleOrderItemsTable.saleOrderId, orderIds))
    : [];

  const productIds = Array.from(new Set(items.map(i => i.productId)));
  const products = productIds.length
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productMap = new Map(products.map(p => [p.id, p]));

  const customerIds = Array.from(new Set(orders.map(o => o.customerId)));
  const customers = customerIds.length
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : [];
  const customerMap = new Map(customers.map(c => [c.id, c]));

  const itemsByOrderId = new Map<number, typeof items>();
  for (const item of items) {
    if (!itemsByOrderId.has(item.saleOrderId)) itemsByOrderId.set(item.saleOrderId, []);
    itemsByOrderId.get(item.saleOrderId)!.push(item);
  }

  type BreakdownItem = {
    productId: number; productName: string; category: string | null; unit: string;
    qty: number; amount: number; profit: number | null;
  };
  const byCustomer = new Map<number, {
    customerId: number; customerName: string; items: BreakdownItem[];
    subtotalAmount: number; subtotalProfit: number;
  }>();

  let hasMissingCost = false;

  for (const order of orders) {
    if (!byCustomer.has(order.customerId)) {
      byCustomer.set(order.customerId, {
        customerId: order.customerId,
        customerName: customerMap.get(order.customerId)?.name ?? "",
        items: [], subtotalAmount: 0, subtotalProfit: 0,
      });
    }
    const bucket = byCustomer.get(order.customerId)!;

    for (const item of itemsByOrderId.get(order.id) ?? []) {
      const product = productMap.get(item.productId);
      const qty = parseFloat(item.qty);
      const amount = parseFloat(item.amount);
      // Prefer the frozen per-sale snapshot; fall back to the product's live cost price
      // only for legacy rows created before cost price was captured at sale time.
      const costPriceRaw = item.costPrice ?? product?.costPrice ?? null;
      const costPrice = costPriceRaw != null ? parseFloat(costPriceRaw) : null;
      const profit = costPrice != null ? amount - qty * costPrice : null;
      if (profit == null) hasMissingCost = true;

      bucket.items.push({
        productId: item.productId,
        productName: product?.name ?? "",
        category: product?.category ?? null,
        unit: product?.unit ?? "bag",
        qty: round2(qty), amount: round2(amount),
        profit: profit != null ? round2(profit) : null,
      });
      bucket.subtotalAmount += amount;
      if (profit != null) bucket.subtotalProfit += profit;
    }
  }

  const customersArr = Array.from(byCustomer.values())
    .map(c => ({ ...c, subtotalAmount: round2(c.subtotalAmount), subtotalProfit: round2(c.subtotalProfit) }))
    .sort((a, b) => b.subtotalAmount - a.subtotalAmount);

  const totalAmount = round2(customersArr.reduce((s, c) => s + c.subtotalAmount, 0));
  const totalProfit = round2(customersArr.reduce((s, c) => s + c.subtotalProfit, 0));

  return { date, totalAmount, totalProfit, hasMissingCost, customers: customersArr };
}

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  const customers = await db.select().from(customersTable);
  let totalOutstanding = 0;
  for (const c of customers) {
    const sales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` }).from(saleOrdersTable).where(and(eq(saleOrdersTable.customerId, c.id), eq(saleOrdersTable.status, "posted")));
    const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` }).from(paymentsTable).where(and(eq(paymentsTable.customerId, c.id), eq(paymentsTable.status, "posted")));
    totalOutstanding += parseFloat(c.openingBalance ?? "0") + parseFloat(String(sales[0]?.total ?? 0)) - parseFloat(String(pmts[0]?.total ?? 0));
  }

  const todayCollections = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` }).from(paymentsTable).where(and(eq(paymentsTable.date, today), eq(paymentsTable.status, "posted")));
  const todaySales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` }).from(saleOrdersTable).where(and(eq(saleOrdersTable.date, today), eq(saleOrdersTable.status, "posted")));
  const todayProfit = (await getProfitBreakdownForDate(today)).totalProfit;

  const activeProducts = await db.select({ count: sql<number>`count(*)` }).from(productsTable);

  res.json({
    totalOutstanding,
    todayCollections: parseFloat(String(todayCollections[0]?.total ?? 0)),
    todaySales: parseFloat(String(todaySales[0]?.total ?? 0)),
    todayProfit,
    totalCustomers: customers.length,
    activeProducts: parseInt(String(activeProducts[0]?.count ?? 0)),
  });
});

router.get("/dashboard/profit-breakdown", requireAuth, async (req, res): Promise<void> => {
  const Query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
  const parsed = Query.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const date = parsed.data.date ?? new Date().toISOString().split("T")[0];

  res.json(await getProfitBreakdownForDate(date));
});

router.get("/dashboard/top-debtors", requireAuth, async (_req, res): Promise<void> => {
  const customers = await db.select().from(customersTable);
  const withBalance = await Promise.all(customers.map(async (c) => {
    const sales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` }).from(saleOrdersTable).where(and(eq(saleOrdersTable.customerId, c.id), eq(saleOrdersTable.status, "posted")));
    const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` }).from(paymentsTable).where(and(eq(paymentsTable.customerId, c.id), eq(paymentsTable.status, "posted")));
    const balance = parseFloat(c.openingBalance ?? "0") + parseFloat(String(sales[0]?.total ?? 0)) - parseFloat(String(pmts[0]?.total ?? 0));
    return { customerId: c.id, customerName: c.name, area: c.area ?? null, balance };
  }));
  res.json(withBalance.filter(x => x.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10));
});

router.get("/dashboard/recent-activity", requireAuth, async (_req, res): Promise<void> => {
  const recentOrders = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.status, "posted")).orderBy(desc(saleOrdersTable.createdAt)).limit(10);
  const recentPayments = await db.select().from(paymentsTable).where(eq(paymentsTable.status, "posted")).orderBy(desc(paymentsTable.createdAt)).limit(10);

  const activity: Array<{ id: number; type: string; date: string; customerId: number; customerName: string; amount: number; description: string }> = [];

  for (const o of recentOrders) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, o.customerId));
    activity.push({ id: o.id, type: "sale", date: o.date, customerId: o.customerId, customerName: c?.name ?? "", amount: parseFloat(o.totalAmount), description: `Sale Order #${o.id}` });
  }
  for (const p of recentPayments) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
    activity.push({ id: p.id, type: "payment", date: p.date, customerId: p.customerId, customerName: c?.name ?? "", amount: parseFloat(p.amount), description: `${p.type === "cash" ? "Cash" : "Bank"} Payment` });
  }

  activity.sort((a, b) => b.date.localeCompare(a.date));
  res.json(activity.slice(0, 15));
});

export default router;
