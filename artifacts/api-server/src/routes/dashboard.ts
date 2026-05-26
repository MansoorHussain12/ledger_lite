import { Router, type IRouter } from "express";
import { db, customersTable, saleOrdersTable, saleOrderItemsTable, paymentsTable, productsTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  const customers = await db.select().from(customersTable);
  let totalOutstanding = 0;
  for (const c of customers) {
    const sales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` }).from(saleOrdersTable).where(eq(saleOrdersTable.customerId, c.id));
    const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` }).from(paymentsTable).where(eq(paymentsTable.customerId, c.id));
    totalOutstanding += parseFloat(c.openingBalance ?? "0") + parseFloat(String(sales[0]?.total ?? 0)) - parseFloat(String(pmts[0]?.total ?? 0));
  }

  const todayCollections = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` }).from(paymentsTable).where(eq(paymentsTable.date, today));
  const todaySales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` }).from(saleOrdersTable).where(eq(saleOrdersTable.date, today));

  const activeProducts = await db.select({ count: sql<number>`count(*)` }).from(productsTable);

  res.json({
    totalOutstanding,
    todayCollections: parseFloat(String(todayCollections[0]?.total ?? 0)),
    todaySales: parseFloat(String(todaySales[0]?.total ?? 0)),
    totalCustomers: customers.length,
    activeProducts: parseInt(String(activeProducts[0]?.count ?? 0)),
  });
});

router.get("/dashboard/top-debtors", requireAuth, async (_req, res): Promise<void> => {
  const customers = await db.select().from(customersTable);
  const withBalance = await Promise.all(customers.map(async (c) => {
    const sales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` }).from(saleOrdersTable).where(eq(saleOrdersTable.customerId, c.id));
    const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` }).from(paymentsTable).where(eq(paymentsTable.customerId, c.id));
    const balance = parseFloat(c.openingBalance ?? "0") + parseFloat(String(sales[0]?.total ?? 0)) - parseFloat(String(pmts[0]?.total ?? 0));
    return { customerId: c.id, customerName: c.name, area: c.area ?? null, balance };
  }));
  res.json(withBalance.filter(x => x.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10));
});

router.get("/dashboard/recent-activity", requireAuth, async (_req, res): Promise<void> => {
  const recentOrders = await db.select().from(saleOrdersTable).orderBy(desc(saleOrdersTable.createdAt)).limit(10);
  const recentPayments = await db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt)).limit(10);

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
