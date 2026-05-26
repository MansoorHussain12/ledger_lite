import { Router, type IRouter } from "express";
import { db, customersTable, saleOrdersTable, saleOrderItemsTable, paymentsTable, productsTable } from "@workspace/db";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
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

function computeBalance(openingBalance: string, debits: number, credits: number): number {
  return parseFloat(openingBalance) + debits - credits;
}

router.get("/customers", requireAuth, async (req, res): Promise<void> => {
  const query = ListCustomersQueryParams.safeParse(req.query);
  const rows = await db.select().from(customersTable).orderBy(customersTable.name);

  // Compute live balance for each customer
  const result = await Promise.all(rows.map(async (c) => {
    const sales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` })
      .from(saleOrdersTable).where(eq(saleOrdersTable.customerId, c.id));
    const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` })
      .from(paymentsTable).where(eq(paymentsTable.customerId, c.id));
    const balance = parseFloat(c.openingBalance ?? "0") + parseFloat(String(sales[0]?.total ?? 0)) - parseFloat(String(pmts[0]?.total ?? 0));
    return {
      id: c.id, name: c.name, area: c.area ?? null, contact: c.contact ?? null,
      creditLimit: c.creditLimit ? parseFloat(c.creditLimit) : null,
      openingBalance: parseFloat(c.openingBalance ?? "0"),
      balance, createdAt: c.createdAt,
    };
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
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, area, contact, creditLimit, openingBalance } = parsed.data;
  const [c] = await db.insert(customersTable).values({
    name, area: area ?? null, contact: contact ?? null,
    creditLimit: creditLimit != null ? String(creditLimit) : null,
    openingBalance: openingBalance != null ? String(openingBalance) : "0",
  }).returning();
  res.status(201).json({ id: c.id, name: c.name, area: c.area ?? null, contact: c.contact ?? null,
    creditLimit: c.creditLimit ? parseFloat(c.creditLimit) : null,
    openingBalance: parseFloat(c.openingBalance ?? "0"), balance: parseFloat(c.openingBalance ?? "0"), createdAt: c.createdAt });
});

router.get("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
  const sales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` })
    .from(saleOrdersTable).where(eq(saleOrdersTable.customerId, c.id));
  const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` })
    .from(paymentsTable).where(eq(paymentsTable.customerId, c.id));
  const balance = parseFloat(c.openingBalance ?? "0") + parseFloat(String(sales[0]?.total ?? 0)) - parseFloat(String(pmts[0]?.total ?? 0));
  res.json({ id: c.id, name: c.name, area: c.area ?? null, contact: c.contact ?? null,
    creditLimit: c.creditLimit ? parseFloat(c.creditLimit) : null,
    openingBalance: parseFloat(c.openingBalance ?? "0"), balance, createdAt: c.createdAt });
});

router.patch("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.area !== undefined) updates.area = parsed.data.area ?? null;
  if (parsed.data.contact !== undefined) updates.contact = parsed.data.contact ?? null;
  if (parsed.data.creditLimit !== undefined) updates.creditLimit = parsed.data.creditLimit != null ? String(parsed.data.creditLimit) : null;
  if (parsed.data.openingBalance != null) updates.openingBalance = String(parsed.data.openingBalance);
  const [c] = await db.update(customersTable).set(updates).where(eq(customersTable.id, params.data.id)).returning();
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
  const sales = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` })
    .from(saleOrdersTable).where(eq(saleOrdersTable.customerId, c.id));
  const pmts2 = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` })
    .from(paymentsTable).where(eq(paymentsTable.customerId, c.id));
  const balance = parseFloat(c.openingBalance ?? "0") + parseFloat(String(sales[0]?.total ?? 0)) - parseFloat(String(pmts2[0]?.total ?? 0));
  res.json({ id: c.id, name: c.name, area: c.area ?? null, contact: c.contact ?? null,
    creditLimit: c.creditLimit ? parseFloat(c.creditLimit) : null,
    openingBalance: parseFloat(c.openingBalance ?? "0"), balance, createdAt: c.createdAt });
});

router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(customersTable).where(eq(customersTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/customers/:id/ledger", requireAuth, async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }

  // Get all sales
  const orders = await db.select().from(saleOrdersTable)
    .where(eq(saleOrdersTable.customerId, params.data.id))
    .orderBy(saleOrdersTable.date);
  // Get all payments
  const pmts = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.customerId, params.data.id))
    .orderBy(paymentsTable.date);

  // Build unified timeline
  const entries: Array<{ date: string; type: string; description: string; debit: number; credit: number; referenceId: number | null }> = [];

  for (const o of orders) {
    entries.push({ date: o.date, type: "sale", description: `Sale Order #${o.id}${o.billtyNo ? ` (${o.billtyNo})` : ""}`, debit: parseFloat(o.totalAmount), credit: 0, referenceId: o.id });
  }
  for (const p of pmts) {
    entries.push({ date: p.date, type: "payment", description: `Payment - ${p.type === "cash" ? "Cash" : `Bank${p.chequeNo ? ` Chq#${p.chequeNo}` : ""}`}`, debit: 0, credit: parseFloat(p.amount), referenceId: p.id });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  const openingBalance = parseFloat(c.openingBalance ?? "0");
  let running = openingBalance;
  let totalDebit = 0, totalCredit = 0;

  const ledgerEntries = entries.map((e, i) => {
    running += e.debit - e.credit;
    totalDebit += e.debit;
    totalCredit += e.credit;
    return { id: i + 1, date: e.date, type: e.type, description: e.description, debit: e.debit, credit: e.credit, balance: running, referenceId: e.referenceId };
  });

  const sales2 = await db.select({ total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)` }).from(saleOrdersTable).where(eq(saleOrdersTable.customerId, c.id));
  const pmts2 = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` }).from(paymentsTable).where(eq(paymentsTable.customerId, c.id));
  const balance = openingBalance + parseFloat(String(sales2[0]?.total ?? 0)) - parseFloat(String(pmts2[0]?.total ?? 0));

  res.json({
    customer: { id: c.id, name: c.name, area: c.area ?? null, contact: c.contact ?? null,
      creditLimit: c.creditLimit ? parseFloat(c.creditLimit) : null,
      openingBalance, balance, createdAt: c.createdAt },
    openingBalance, closingBalance: balance, totalDebit, totalCredit, entries: ledgerEntries,
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
  for (const p of pmts) entries.push({ date: p.date, desc: `Payment (${p.type})`, debit: 0, credit: parseFloat(p.amount) });
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const openingBalance = parseFloat(c.openingBalance ?? "0");
  let running = openingBalance;
  const lines = [`*${c.name} - Ledger Statement*`, `Opening Balance: Rs. ${openingBalance.toLocaleString()}`, "─".repeat(40)];
  for (const e of entries) {
    running += e.debit - e.credit;
    const col = e.debit > 0 ? `Dr ${e.debit.toLocaleString()}` : `Cr ${e.credit.toLocaleString()}`;
    lines.push(`${e.date}  ${e.desc.padEnd(18)} ${col.padStart(12)}  Bal: ${running.toLocaleString()}`);
  }
  lines.push("─".repeat(40));
  lines.push(`*Closing Balance: Rs. ${running.toLocaleString()}*`);

  res.json({ customerId: c.id, customerName: c.name, text: lines.join("\n") });
});

export default router;
