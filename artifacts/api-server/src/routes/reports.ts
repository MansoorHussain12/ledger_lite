import { Router, type IRouter } from "express";
import { db, customersTable, saleOrdersTable, saleOrderItemsTable, paymentsTable, productsTable, expensesTable } from "@workspace/db";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { GetDailyCollectionReportQueryParams, GetMonthlySalesReportQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/reports/aging", requireAuth, async (_req, res): Promise<void> => {
  const customers = await db.select().from(customersTable).orderBy(customersTable.name);
  const now = new Date();

  const result = await Promise.all(customers.map(async (c) => {
    const orders = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.customerId, c.id));
    const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` }).from(paymentsTable).where(eq(paymentsTable.customerId, c.id));

    const openingBal = parseFloat(c.openingBalance ?? "0");
    const totalPaid = parseFloat(String(pmts[0]?.total ?? 0));
    let remaining = totalPaid;

    let d0to30 = 0, d31to60 = 0, d61to90 = 0, dOver90 = 0;
    for (const o of orders.sort((a, b) => a.date.localeCompare(b.date))) {
      const amt = parseFloat(o.totalAmount);
      const days = Math.floor((now.getTime() - new Date(o.date).getTime()) / (1000 * 60 * 60 * 24));
      const unpaid = Math.max(0, amt - remaining);
      remaining = Math.max(0, remaining - amt);
      if (days <= 30) d0to30 += unpaid;
      else if (days <= 60) d31to60 += unpaid;
      else if (days <= 90) d61to90 += unpaid;
      else dOver90 += unpaid;
    }

    const totalSales = orders.reduce((s, o) => s + parseFloat(o.totalAmount), 0);
    const balance = openingBal + totalSales - parseFloat(String(pmts[0]?.total ?? 0));
    if (balance <= 0) return null;

    return {
      customerId: c.id, customerName: c.name, area: c.area ?? null, contact: c.contact ?? null,
      balance, days0to30: d0to30, days31to60: d31to60, days61to90: d61to90, daysOver90: dOver90,
    };
  }));

  res.json(result.filter(Boolean));
});

router.get("/reports/daily-collection", requireAuth, async (req, res): Promise<void> => {
  const query = GetDailyCollectionReportQueryParams.safeParse(req.query);
  const date = (query.success && query.data.date) ? query.data.date : new Date().toISOString().split("T")[0];

  const pmts = await db.select().from(paymentsTable).where(eq(paymentsTable.date, String(date))).orderBy(paymentsTable.createdAt);
  const result = await Promise.all(pmts.map(async (p) => {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, p.customerId));
    return { id: p.id, customerId: p.customerId, customerName: c?.name ?? "", date: p.date, type: p.type, amount: parseFloat(p.amount), bankAccount: p.bankAccount ?? null, chequeNo: p.chequeNo ?? null, notes: p.notes ?? null, createdAt: p.createdAt };
  }));

  const totalCash = result.filter(p => p.type === "cash").reduce((s, p) => s + p.amount, 0);
  const totalBank = result.filter(p => p.type === "bank").reduce((s, p) => s + p.amount, 0);
  res.json({ date, totalCash, totalBank, total: totalCash + totalBank, payments: result });
});

router.get("/reports/monthly-sales", requireAuth, async (req, res): Promise<void> => {
  const query = GetMonthlySalesReportQueryParams.safeParse(req.query);
  const now = new Date();
  const year = (query.success && query.data.year) ? query.data.year : now.getFullYear();
  const month = (query.success && query.data.month) ? query.data.month : now.getMonth() + 1;

  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const toDate = new Date(year, month, 0);
  const to = `${year}-${String(month).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;

  const orders = await db.select().from(saleOrdersTable).where(and(gte(saleOrdersTable.date, from), lte(saleOrdersTable.date, to)));
  const products = await db.select().from(productsTable);

  const byProduct: Record<number, { productId: number; productName: string; totalQty: number; totalAmount: number }> = {};
  let totalQty = 0, totalAmount = 0;

  for (const o of orders) {
    const items = await db.select().from(saleOrderItemsTable).where(eq(saleOrderItemsTable.saleOrderId, o.id));
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!byProduct[item.productId]) byProduct[item.productId] = { productId: item.productId, productName: product?.name ?? "", totalQty: 0, totalAmount: 0 };
      byProduct[item.productId].totalQty += parseFloat(item.qty);
      byProduct[item.productId].totalAmount += parseFloat(item.amount);
      totalQty += parseFloat(item.qty);
    }
    totalAmount += parseFloat(o.totalAmount);
  }

  res.json({ year, month, totalAmount, totalQty, byProduct: Object.values(byProduct) });
});

router.get("/reports/daily-profit", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const todayStr = now.toISOString().slice(0, 10);
  const from = (req.query.from as string) || firstOfMonth;
  const to = (req.query.to as string) || todayStr;

  // Fetch all sale orders in range with their items
  const orders = await db
    .select()
    .from(saleOrdersTable)
    .where(and(gte(saleOrdersTable.date, from), lte(saleOrdersTable.date, to)));

  const allProducts = await db.select().from(productsTable);
  const productMap = new Map(allProducts.map(p => [p.id, p]));

  // Fetch all expenses in range
  const expenses = await db
    .select()
    .from(expensesTable)
    .where(and(gte(expensesTable.date, from), lte(expensesTable.date, to)));

  // Build day map
  const dayMap = new Map<string, {
    revenue: number; cogs: number; expenses: number; orders: number; qty: number;
  }>();

  // Build product map for breakdown
  const byProduct = new Map<number, {
    productId: number; productName: string; qty: number; revenue: number; cogs: number;
  }>();

  for (const order of orders) {
    const dateStr = typeof order.date === "string" ? order.date : (order.date as Date).toISOString().slice(0, 10);
    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, { revenue: 0, cogs: 0, expenses: 0, orders: 0, qty: 0 });
    }
    const day = dayMap.get(dateStr)!;
    day.revenue += parseFloat(order.totalAmount);
    day.orders += 1;

    const items = await db
      .select()
      .from(saleOrderItemsTable)
      .where(eq(saleOrderItemsTable.saleOrderId, order.id));

    for (const item of items) {
      const qty = parseFloat(item.qty);
      const saleAmount = parseFloat(item.amount);
      const product = productMap.get(item.productId);
      const costPrice = product?.costPrice ? parseFloat(product.costPrice) : 0;
      const itemCogs = qty * costPrice;

      day.qty += qty;
      day.cogs += itemCogs;

      // Product breakdown
      if (!byProduct.has(item.productId)) {
        byProduct.set(item.productId, {
          productId: item.productId,
          productName: product?.name ?? "",
          qty: 0, revenue: 0, cogs: 0,
        });
      }
      const prod = byProduct.get(item.productId)!;
      prod.qty += qty;
      prod.revenue += saleAmount;
      prod.cogs += itemCogs;
    }
  }

  // Distribute expenses into day map
  for (const exp of expenses) {
    const dateStr = typeof exp.date === "string" ? exp.date : (exp.date as Date).toISOString().slice(0, 10);
    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, { revenue: 0, cogs: 0, expenses: 0, orders: 0, qty: 0 });
    }
    dayMap.get(dateStr)!.expenses += parseFloat(exp.amount);
  }

  // Sort days
  const days = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const grossProfit = d.revenue - d.cogs;
      const netProfit = grossProfit - d.expenses;
      return {
        date,
        revenue: Math.round(d.revenue * 100) / 100,
        cogs: Math.round(d.cogs * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMargin: d.revenue > 0 ? Math.round((grossProfit / d.revenue) * 10000) / 100 : 0,
        expenses: Math.round(d.expenses * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        netMargin: d.revenue > 0 ? Math.round((netProfit / d.revenue) * 10000) / 100 : 0,
        orders: d.orders,
        qty: Math.round(d.qty * 100) / 100,
      };
    });

  // Totals
  const totRevenue = days.reduce((s, d) => s + d.revenue, 0);
  const totCogs = days.reduce((s, d) => s + d.cogs, 0);
  const totExpenses = days.reduce((s, d) => s + d.expenses, 0);
  const totGross = totRevenue - totCogs;
  const totNet = totGross - totExpenses;
  const totOrders = days.reduce((s, d) => s + d.orders, 0);
  const totQty = days.reduce((s, d) => s + d.qty, 0);

  const summary = {
    revenue: Math.round(totRevenue * 100) / 100,
    cogs: Math.round(totCogs * 100) / 100,
    grossProfit: Math.round(totGross * 100) / 100,
    grossMargin: totRevenue > 0 ? Math.round((totGross / totRevenue) * 10000) / 100 : 0,
    expenses: Math.round(totExpenses * 100) / 100,
    netProfit: Math.round(totNet * 100) / 100,
    netMargin: totRevenue > 0 ? Math.round((totNet / totRevenue) * 10000) / 100 : 0,
    orders: totOrders,
    qty: Math.round(totQty * 100) / 100,
  };

  const byProductArr = Array.from(byProduct.values()).map(p => ({
    ...p,
    qty: Math.round(p.qty * 100) / 100,
    revenue: Math.round(p.revenue * 100) / 100,
    cogs: Math.round(p.cogs * 100) / 100,
    profit: Math.round((p.revenue - p.cogs) * 100) / 100,
    margin: p.revenue > 0 ? Math.round(((p.revenue - p.cogs) / p.revenue) * 10000) / 100 : 0,
  })).sort((a, b) => b.profit - a.profit);

  res.json({ from, to, summary, days, byProduct: byProductArr });
});

router.get("/reports/outstanding", requireAuth, async (_req, res): Promise<void> => {
  const customers = await db.select().from(customersTable).orderBy(customersTable.name);
  const result = await Promise.all(customers.map(async (c) => {
    const sales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` }).from(saleOrdersTable).where(eq(saleOrdersTable.customerId, c.id));
    const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` }).from(paymentsTable).where(eq(paymentsTable.customerId, c.id));
    const balance = parseFloat(c.openingBalance ?? "0") + parseFloat(String(sales[0]?.total ?? 0)) - parseFloat(String(pmts[0]?.total ?? 0));

    const lastSale = await db.select({ date: saleOrdersTable.date }).from(saleOrdersTable).where(eq(saleOrdersTable.customerId, c.id)).orderBy(sql`${saleOrdersTable.date} desc`).limit(1);
    const lastPmt = await db.select({ date: paymentsTable.date }).from(paymentsTable).where(eq(paymentsTable.customerId, c.id)).orderBy(sql`${paymentsTable.date} desc`).limit(1);
    const creditLimit = c.creditLimit ? parseFloat(c.creditLimit) : null;
    const isOverLimit = creditLimit != null && balance > creditLimit;

    return {
      customerId: c.id, customerName: c.name, area: c.area ?? null, contact: c.contact ?? null,
      creditLimit, balance, lastSaleDate: lastSale[0]?.date ?? null, lastPaymentDate: lastPmt[0]?.date ?? null, isOverLimit,
    };
  }));
  res.json(result.filter(r => r.balance > 0));
});

export default router;
