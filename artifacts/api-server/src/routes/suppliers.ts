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
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
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
      openingBalanceDate: s.openingBalanceDate ?? null,
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
    openingBalanceDate: s.openingBalanceDate ?? null,
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

function toSupplierRowResponse(s: typeof suppliersTable.$inferSelect, balance: number) {
  return {
    id: s.id,
    name: s.name,
    contact: s.contact ?? null,
    address: s.address ?? null,
    ntn: s.ntn ?? null,
    openingBalance: parseFloat(s.openingBalance ?? "0"),
    openingBalanceDate: s.openingBalanceDate ?? null,
    payableBalance: balance,
    createdAt: s.createdAt,
  };
}

// ── GET /suppliers/:id/ledger ─────────────────────────────────────────────────
// Mirrors customers.ts's /:id/ledger, with the balance sign flipped: purchases
// increase what we owe the supplier, payments (whether the invoice's own inline
// paidAmount or a standalone supplier_payments row) decrease it. Only "live"
// (posted) rows are summed — see the correction workflow.

router.get("/suppliers/:id/ledger", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!s) { res.status(404).json({ error: "Supplier not found" }); return; }

  const fromDate = req.query.from ? String(req.query.from) : null;
  const toDate = req.query.to ? String(req.query.to) : null;

  const invoiceConditions = [eq(purchaseInvoicesTable.supplierId, id), eq(purchaseInvoicesTable.status, "posted")];
  const paymentConditions = [eq(supplierPaymentsTable.supplierId, id), eq(supplierPaymentsTable.status, "posted")];
  if (fromDate) {
    invoiceConditions.push(gte(purchaseInvoicesTable.date, fromDate));
    paymentConditions.push(gte(supplierPaymentsTable.date, fromDate));
  }
  if (toDate) {
    invoiceConditions.push(lte(purchaseInvoicesTable.date, toDate));
    paymentConditions.push(lte(supplierPaymentsTable.date, toDate));
  }

  const invoices = await db.select().from(purchaseInvoicesTable)
    .where(and(...invoiceConditions))
    .orderBy(asc(purchaseInvoicesTable.date), asc(purchaseInvoicesTable.id));

  const pmts = await db.select().from(supplierPaymentsTable)
    .where(and(...paymentConditions))
    .orderBy(asc(supplierPaymentsTable.date), asc(supplierPaymentsTable.id));

  // Opening balance as-of fromDate: everything posted strictly before it.
  let openingBalance = parseFloat(s.openingBalance ?? "0");
  if (fromDate) {
    const beforeInvoices = await db.select({
      totalAmount: sql<number>`coalesce(sum(${purchaseInvoicesTable.totalAmount}),0)`,
      paidAmount: sql<number>`coalesce(sum(${purchaseInvoicesTable.paidAmount}),0)`,
    }).from(purchaseInvoicesTable)
      .where(and(eq(purchaseInvoicesTable.supplierId, id), eq(purchaseInvoicesTable.status, "posted"), sql`${purchaseInvoicesTable.date} < ${fromDate}`));
    const beforePmts = await db.select({ total: sql<number>`coalesce(sum(${supplierPaymentsTable.amount}),0)` })
      .from(supplierPaymentsTable)
      .where(and(eq(supplierPaymentsTable.supplierId, id), eq(supplierPaymentsTable.status, "posted"), sql`${supplierPaymentsTable.date} < ${fromDate}`));
    openingBalance = parseFloat(s.openingBalance ?? "0")
      + parseFloat(String(beforeInvoices[0]?.totalAmount ?? 0))
      - parseFloat(String(beforeInvoices[0]?.paidAmount ?? 0))
      - parseFloat(String(beforePmts[0]?.total ?? 0));
  }

  type TimelineRow = {
    date: string;
    sortKey: string;
    transactionType: string;
    remarks: string | null;
    documentNo: string | null;
    item: string | null;
    unit: string | null;
    qtyBags: number | null;
    rateBag: number | null;
    purchaseValue: number;
    paidAmount: number;
  };

  const rows: TimelineRow[] = [];

  // Category totals accumulator (purchase item values), independent of row granularity.
  const categoryTotals = new Map<string, number>();
  const categoryQtys = new Map<string, number>();
  const categoryUnits = new Map<string, string>();

  // Purchase invoice rows — one row per invoice (an invoice's own inline paidAmount, e.g.
  // from a cash purchase, is folded into the same row rather than a separate payment row).
  for (const inv of invoices) {
    const items = await db.select({
      productName: productsTable.name,
      category: productsTable.category,
      unit: productsTable.unit,
      qty: purchaseInvoiceItemsTable.qty,
      rate: purchaseInvoiceItemsTable.rate,
      amount: purchaseInvoiceItemsTable.amount,
    }).from(purchaseInvoiceItemsTable)
      .leftJoin(productsTable, eq(purchaseInvoiceItemsTable.productId, productsTable.id))
      .where(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, inv.id));

    for (const item of items) {
      const cat = item.category?.trim() || "Uncategorised";
      const amount = parseFloat(item.amount);
      const qty = parseFloat(item.qty);
      categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + amount);
      categoryQtys.set(cat, (categoryQtys.get(cat) ?? 0) + qty);
      if (item.unit) categoryUnits.set(cat, item.unit);
    }

    rows.push({
      date: inv.date,
      sortKey: `${inv.date}_1_${String(inv.id).padStart(8, "0")}`,
      transactionType: "Purchase",
      remarks: inv.notes ?? null,
      documentNo: inv.invoiceNo ?? `PUR-${inv.id}`,
      item: items.map(i => i.productName).filter(Boolean).join(", ") || null,
      unit: items.length === 1 ? (items[0].unit ?? null) : null,
      qtyBags: items.length === 1 ? parseFloat(items[0].qty) : null,
      rateBag: items.length === 1 ? parseFloat(items[0].rate) : null,
      purchaseValue: parseFloat(inv.totalAmount),
      paidAmount: parseFloat(inv.paidAmount),
    });
  }

  // Standalone supplier payment rows
  const paymentModeLabels: Record<string, string> = {
    cash: "Cash Paid", bank: "Bank Paid", easypaisa: "Easypaisa Paid",
    jazzcash: "JazzCash Paid", cheque: "Cheque Paid", other: "Payment",
  };
  for (const p of pmts) {
    rows.push({
      date: p.date,
      sortKey: `${p.date}_0_${String(p.id).padStart(8, "0")}`,
      transactionType: paymentModeLabels[p.paymentMode] ?? "Payment",
      remarks: p.notes ?? null,
      documentNo: p.chequeNo ?? p.bankAccount ?? null,
      item: null,
      unit: null,
      qtyBags: null,
      rateBag: null,
      purchaseValue: 0,
      paidAmount: parseFloat(p.amount),
    });
  }

  // Sort by date then by type (payments before purchases same day, per the customer convention)
  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  let running = openingBalance;
  let totalPurchased = 0, totalPaid = 0;

  const entries = rows.map((row, i) => {
    running = running + row.purchaseValue - row.paidAmount;
    totalPurchased += row.purchaseValue;
    totalPaid += row.paidAmount;
    return {
      srNo: i + 1,
      date: row.date,
      transactionType: row.transactionType,
      remarks: row.remarks,
      documentNo: row.documentNo,
      item: row.item,
      unit: row.unit,
      qtyBags: row.qtyBags,
      rateBag: row.rateBag,
      purchaseValue: row.purchaseValue,
      paidAmount: row.paidAmount,
      balance: Math.round(running * 100) / 100,
    };
  });

  const catTotal = Array.from(categoryTotals.values()).reduce((a, b) => a + b, 0);
  const categoryBreakdown = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({
      category,
      unit: categoryUnits.get(category) ?? null,
      qty: Math.round((categoryQtys.get(category) ?? 0) * 100) / 100,
      amount: Math.round(amount * 100) / 100,
      share: catTotal > 0 ? Math.round((amount / catTotal) * 1000) / 10 : 0,
    }));

  res.json({
    supplier: toSupplierRowResponse(s, running),
    openingBalance: Math.round(openingBalance * 100) / 100,
    openingBalanceDate: fromDate ?? s.openingBalanceDate ?? null,
    closingBalance: Math.round(running * 100) / 100,
    totalPurchased: Math.round(totalPurchased * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    from: fromDate,
    to: toDate,
    entries,
    categoryBreakdown,
  });
});

// ── GET /suppliers/:id/statement ──────────────────────────────────────────────

router.get("/suppliers/:id/statement", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!s) { res.status(404).json({ error: "Supplier not found" }); return; }

  const invoices = await db.select().from(purchaseInvoicesTable)
    .where(and(eq(purchaseInvoicesTable.supplierId, id), eq(purchaseInvoicesTable.status, "posted")))
    .orderBy(purchaseInvoicesTable.date);
  const pmts = await db.select().from(supplierPaymentsTable)
    .where(and(eq(supplierPaymentsTable.supplierId, id), eq(supplierPaymentsTable.status, "posted")))
    .orderBy(supplierPaymentsTable.date);

  const entries: Array<{ date: string; desc: string; debit: number; credit: number }> = [];
  for (const inv of invoices) {
    entries.push({ date: inv.date, desc: `Purchase ${inv.invoiceNo ?? `#${inv.id}`}`, debit: parseFloat(inv.totalAmount), credit: 0 });
    if (parseFloat(inv.paidAmount) > 0) {
      entries.push({ date: inv.date, desc: `Payment (Inv ${inv.invoiceNo ?? `#${inv.id}`})`, debit: 0, credit: parseFloat(inv.paidAmount) });
    }
  }
  for (const p of pmts) entries.push({ date: p.date, desc: "Payment", debit: 0, credit: parseFloat(p.amount) });
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const openingBalance = parseFloat(s.openingBalance ?? "0");
  let running = openingBalance;
  const lines = [`*${s.name} - Account Statement*`, `Opening Balance: Rs. ${openingBalance.toLocaleString()}`, "─".repeat(40)];
  for (const e of entries) {
    running += e.debit - e.credit;
    const col = e.debit > 0 ? `Dr ${e.debit.toLocaleString()}` : `Cr ${e.credit.toLocaleString()}`;
    lines.push(`${e.date}  ${e.desc.padEnd(18)} ${col.padStart(12)}  Bal: ${running.toLocaleString()}`);
  }
  lines.push("─".repeat(40));
  lines.push(`*Payable Balance: Rs. ${running.toLocaleString()}*`);
  if (s.contact) lines.push(`Contact: ${s.contact}`);

  res.json({ supplierId: s.id, supplierName: s.name, text: lines.join("\n") });
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
