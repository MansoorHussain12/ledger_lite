import { Router, type IRouter } from "express";
import { db, customersTable, saleOrdersTable, saleOrderItemsTable, paymentsTable, productsTable } from "@workspace/db";
import { eq, desc, sql, and, gte, lte, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  ListCustomersQueryParams,
  CreateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  UpdateCustomerBody,
  DeleteCustomerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function computeCustomerBalance(customerId: number, openingBalance: string) {
  const sales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` })
    .from(saleOrdersTable).where(eq(saleOrdersTable.customerId, customerId));
  const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` })
    .from(paymentsTable).where(eq(paymentsTable.customerId, customerId));
  return parseFloat(openingBalance) + parseFloat(String(sales[0]?.total ?? 0)) - parseFloat(String(pmts[0]?.total ?? 0));
}

function toCustomerResponse(c: typeof customersTable.$inferSelect, balance: number) {
  return {
    id: c.id,
    name: c.name,
    ntn: c.ntn ?? null,
    area: c.area ?? null,
    address: c.address ?? null,
    contact: c.contact ?? null,
    creditLimit: c.creditLimit ? parseFloat(c.creditLimit) : null,
    openingBalance: parseFloat(c.openingBalance ?? "0"),
    openingBalanceDate: c.openingBalanceDate ?? null,
    balance,
    createdAt: c.createdAt,
  };
}

router.get("/customers", requireAuth, async (req, res): Promise<void> => {
  const query = ListCustomersQueryParams.safeParse(req.query);
  const rows = await db.select().from(customersTable).orderBy(customersTable.name);

  const result = await Promise.all(rows.map(async (c) => {
    const balance = await computeCustomerBalance(c.id, c.openingBalance ?? "0");
    return toCustomerResponse(c, balance);
  }));

  let filtered = result;
  if (query.success && query.data.search) {
    const s = query.data.search.toLowerCase();
    filtered = result.filter(r => r.name.toLowerCase().includes(s) || (r.area ?? "").toLowerCase().includes(s));
  }
  if (query.success && query.data.area) {
    filtered = filtered.filter(r => r.area?.toLowerCase() === query.data.area!.toLowerCase());
  }
  res.json(filtered);
});

router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { name, ntn, area, address, contact, creditLimit, openingBalance, openingBalanceDate } = parsed.data;
  const [c] = await db.insert(customersTable).values({
    name,
    ntn: ntn ?? null,
    area: area ?? null,
    address: address ?? null,
    contact: contact ?? null,
    creditLimit: creditLimit != null ? String(creditLimit) : null,
    openingBalance: openingBalance != null ? String(openingBalance) : "0",
    openingBalanceDate: openingBalanceDate ? String(openingBalanceDate) : null,
  }).returning();
  res.status(201).json(toCustomerResponse(c, parseFloat(c.openingBalance ?? "0")));
});

router.get("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
  const balance = await computeCustomerBalance(c.id, c.openingBalance ?? "0");
  res.json(toCustomerResponse(c, balance));
});

router.patch("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.ntn !== undefined) updates.ntn = parsed.data.ntn ?? null;
  if (parsed.data.area !== undefined) updates.area = parsed.data.area ?? null;
  if (parsed.data.address !== undefined) updates.address = parsed.data.address ?? null;
  if (parsed.data.contact !== undefined) updates.contact = parsed.data.contact ?? null;
  if (parsed.data.creditLimit !== undefined) updates.creditLimit = parsed.data.creditLimit != null ? String(parsed.data.creditLimit) : null;
  if (parsed.data.openingBalance != null) updates.openingBalance = String(parsed.data.openingBalance);
  if (parsed.data.openingBalanceDate !== undefined) updates.openingBalanceDate = parsed.data.openingBalanceDate ? String(parsed.data.openingBalanceDate) : null;
  const [c] = await db.update(customersTable).set(updates).where(eq(customersTable.id, params.data.id)).returning();
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
  const balance = await computeCustomerBalance(c.id, c.openingBalance ?? "0");
  res.json(toCustomerResponse(c, balance));
});

router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(customersTable).where(eq(customersTable.id, params.data.id));
  res.sendStatus(204);
});

// Bags per metric ton for cement (50kg bags → 20 bags = 1 ton)
const BAGS_PER_TON = 20;

router.get("/customers/:id/ledger", requireAuth, async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }

  const fromDate = req.query.from ? String(req.query.from) : null;
  const toDate = req.query.to ? String(req.query.to) : null;

  // Build conditions for date range
  const orderConditions = [eq(saleOrdersTable.customerId, params.data.id)];
  const paymentConditions = [eq(paymentsTable.customerId, params.data.id)];
  if (fromDate) {
    orderConditions.push(gte(saleOrdersTable.date, fromDate));
    paymentConditions.push(gte(paymentsTable.date, fromDate));
  }
  if (toDate) {
    orderConditions.push(lte(saleOrdersTable.date, toDate));
    paymentConditions.push(lte(paymentsTable.date, toDate));
  }

  // Get orders in date range
  const orders = await db.select().from(saleOrdersTable)
    .where(and(...orderConditions))
    .orderBy(asc(saleOrdersTable.date), asc(saleOrdersTable.id));

  // Get items for those orders
  const orderItemsMap: Map<number, Array<{
    productId: number; productName: string;
    qty: number; rate: number; amount: number;
  }>> = new Map();

  for (const order of orders) {
    const items = await db.select({
      id: saleOrderItemsTable.id,
      productId: saleOrderItemsTable.productId,
      qty: saleOrderItemsTable.qty,
      rate: saleOrderItemsTable.rate,
      amount: saleOrderItemsTable.amount,
      productName: productsTable.name,
    }).from(saleOrderItemsTable)
      .leftJoin(productsTable, eq(saleOrderItemsTable.productId, productsTable.id))
      .where(eq(saleOrderItemsTable.saleOrderId, order.id));

    orderItemsMap.set(order.id, items.map(i => ({
      productId: i.productId,
      productName: i.productName ?? "",
      qty: parseFloat(i.qty),
      rate: parseFloat(i.rate),
      amount: parseFloat(i.amount),
    })));
  }

  // Get payments in date range
  const pmts = await db.select().from(paymentsTable)
    .where(and(...paymentConditions))
    .orderBy(asc(paymentsTable.date), asc(paymentsTable.id));

  // Calculate opening balance UP TO fromDate (all transactions before range)
  let openingBalance = parseFloat(c.openingBalance ?? "0");
  if (fromDate) {
    const prevOrders = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` })
      .from(saleOrdersTable)
      .where(and(eq(saleOrdersTable.customerId, params.data.id), lte(saleOrdersTable.date, fromDate)));
    const prevPmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.customerId, params.data.id), lte(paymentsTable.date, fromDate)));
    // opening for range = base opening + all sales up to (fromDate-1) - all payments up to (fromDate-1)
    // But we use lte(fromDate) which includes fromDate — need lt(fromDate)
    // Simple approach: get everything before fromDate (exclusive)
    const beforeOrders = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` })
      .from(saleOrdersTable)
      .where(and(eq(saleOrdersTable.customerId, params.data.id), sql`${saleOrdersTable.date} < ${fromDate}`));
    const beforePmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.customerId, params.data.id), sql`${paymentsTable.date} < ${fromDate}`));
    openingBalance = parseFloat(c.openingBalance ?? "0")
      + parseFloat(String(beforeOrders[0]?.total ?? 0))
      - parseFloat(String(beforePmts[0]?.total ?? 0));
  }

  // Build unified timeline: one row per payment, one row per sale-order-item
  type TimelineRow = {
    date: string;
    sortKey: string;
    transactionType: string;
    remarks: string | null;
    documentNo: string | null;
    billNo: string | null;
    item: string | null;
    billtyNo: string | null;
    vehicleNo: string | null;
    weightTons: number | null;
    rateTon: number | null;
    qtyBags: number | null;
    rateBag: number | null;
    receivedAmount: number;
    paidAmount: number;
    soValue: number;
  };

  const rows: TimelineRow[] = [];

  // Payment rows
  for (const p of pmts) {
    let transactionType = p.type === "bank" ? "Bank Deposited" : "Cash Received";
    if (p.notes) transactionType = `${transactionType} ${p.notes}`;
    const documentNo = p.chequeNo
      ? `CHQ-${p.chequeNo}`
      : p.bankAccount
        ? `Bank: ${p.bankAccount}`
        : null;
    rows.push({
      date: p.date,
      sortKey: `${p.date}_0_${String(p.id).padStart(8, "0")}`,
      transactionType,
      remarks: p.notes ?? null,
      documentNo,
      billNo: null,
      item: null,
      billtyNo: null,
      vehicleNo: null,
      weightTons: null,
      rateTon: null,
      qtyBags: null,
      rateBag: null,
      receivedAmount: parseFloat(p.amount),
      paidAmount: 0,
      soValue: 0,
    });
  }

  // Sale order rows — one row per item
  for (const order of orders) {
    const items = orderItemsMap.get(order.id) ?? [];
    for (const item of items) {
      const tons = item.qty / BAGS_PER_TON;
      const rateTon = item.rate * BAGS_PER_TON;
      rows.push({
        date: order.date,
        sortKey: `${order.date}_1_${String(order.id).padStart(8, "0")}`,
        transactionType: "Sale Order",
        remarks: order.notes ?? null,
        documentNo: `SO-${order.id}`,
        billNo: null,
        item: item.productName,
        billtyNo: order.billtyNo ?? null,
        vehicleNo: order.vehicleNo ?? null,
        weightTons: Math.round(tons * 100) / 100,
        rateTon: Math.round(rateTon),
        qtyBags: item.qty,
        rateBag: item.rate,
        receivedAmount: 0,
        paidAmount: 0,
        soValue: item.amount,
      });
    }
    // If order has no items (shouldn't happen), add a single row
    if (items.length === 0) {
      rows.push({
        date: order.date,
        sortKey: `${order.date}_1_${String(order.id).padStart(8, "0")}`,
        transactionType: "Sale Order",
        remarks: order.notes ?? null,
        documentNo: `SO-${order.id}`,
        billNo: null,
        item: null,
        billtyNo: order.billtyNo ?? null,
        vehicleNo: order.vehicleNo ?? null,
        weightTons: null,
        rateTon: null,
        qtyBags: null,
        rateBag: null,
        receivedAmount: 0,
        paidAmount: 0,
        soValue: parseFloat(order.totalAmount),
      });
    }
  }

  // Sort by date then by type (payments before sales on same day, per original format)
  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Compute running balance
  let running = openingBalance;
  let totalReceived = 0, totalPaid = 0, totalSoValue = 0, totalTons = 0;

  const entries = rows.map((row, i) => {
    running = running - row.receivedAmount + row.paidAmount + row.soValue;
    totalReceived += row.receivedAmount;
    totalPaid += row.paidAmount;
    totalSoValue += row.soValue;
    totalTons += row.weightTons ?? 0;
    return {
      srNo: i + 1,
      date: row.date,
      transactionType: row.transactionType,
      remarks: row.remarks,
      documentNo: row.documentNo,
      billNo: row.billNo,
      item: row.item,
      billtyNo: row.billtyNo,
      vehicleNo: row.vehicleNo,
      weightTons: row.weightTons,
      rateTon: row.rateTon,
      qtyBags: row.qtyBags,
      rateBag: row.rateBag,
      receivedAmount: row.receivedAmount,
      paidAmount: row.paidAmount,
      soValue: row.soValue,
      balance: Math.round(running * 100) / 100,
    };
  });

  res.json({
    customer: toCustomerResponse(c, running),
    openingBalance: Math.round(openingBalance * 100) / 100,
    openingBalanceDate: fromDate ?? c.openingBalanceDate ?? null,
    closingBalance: Math.round(running * 100) / 100,
    totalReceived: Math.round(totalReceived * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalSoValue: Math.round(totalSoValue * 100) / 100,
    totalTons: Math.round(totalTons * 100) / 100,
    from: fromDate,
    to: toDate,
    entries,
  });
});

router.get("/customers/:id/statement", requireAuth, async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }

  const orders = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.customerId, params.data.id)).orderBy(saleOrdersTable.date);
  const pmts = await db.select().from(paymentsTable).where(eq(paymentsTable.customerId, params.data.id)).orderBy(paymentsTable.date);

  const entries: Array<{ date: string; desc: string; debit: number; credit: number }> = [];
  for (const o of orders) entries.push({ date: o.date, desc: `Sale #${o.id}`, debit: parseFloat(o.totalAmount), credit: 0 });
  for (const p of pmts) entries.push({ date: p.date, desc: `${p.type === "bank" ? "Bank" : "Cash"} payment`, debit: 0, credit: parseFloat(p.amount) });
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const openingBalance = parseFloat(c.openingBalance ?? "0");
  let running = openingBalance;
  const lines = [`*${c.name} - Account Statement*`, `Opening Balance: Rs. ${openingBalance.toLocaleString()}`, "─".repeat(40)];
  for (const e of entries) {
    running += e.debit - e.credit;
    const col = e.debit > 0 ? `Dr ${e.debit.toLocaleString()}` : `Cr ${e.credit.toLocaleString()}`;
    lines.push(`${e.date}  ${e.desc.padEnd(18)} ${col.padStart(12)}  Bal: ${running.toLocaleString()}`);
  }
  lines.push("─".repeat(40));
  lines.push(`*Balance: Rs. ${running.toLocaleString()}*`);
  if (c.contact) lines.push(`Contact: ${c.contact}`);

  res.json({ customerId: c.id, customerName: c.name, text: lines.join("\n") });
});

export default router;
