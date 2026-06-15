import { Router } from "express";
import { db } from "@workspace/db";
import {
  suppliersTable,
  purchaseInvoicesTable,
  purchaseInvoiceItemsTable,
  productsTable,
  cashbookEntriesTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function toDateStr(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d);
}

// ── helpers: supplier payable balance ────────────────────────────────────────
// balance = opening_balance + sum(total_amount) - sum(paid_amount)

async function supplierBalance(supplierId: number): Promise<number> {
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!s) return 0;
  const [agg] = await db
    .select({
      totalBilled: sql<string>`coalesce(sum(total_amount),0)`,
      totalPaid: sql<string>`coalesce(sum(paid_amount),0)`,
    })
    .from(purchaseInvoicesTable)
    .where(eq(purchaseInvoicesTable.supplierId, supplierId));

  const opening = parseFloat(s.openingBalance ?? "0");
  const billed = parseFloat(agg?.totalBilled ?? "0");
  const paid = parseFloat(agg?.totalPaid ?? "0");
  return Math.round((opening + billed - paid) * 100) / 100;
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
    .where(eq(purchaseInvoicesTable.supplierId, id))
    .orderBy(desc(purchaseInvoicesTable.date), desc(purchaseInvoicesTable.id));

  const balance = await supplierBalance(id);

  res.json({
    id: s.id,
    name: s.name,
    contact: s.contact ?? null,
    address: s.address ?? null,
    ntn: s.ntn ?? null,
    openingBalance: parseFloat(s.openingBalance ?? "0"),
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

// ── GET /purchases ────────────────────────────────────────────────────────────

router.get("/purchases", requireAuth, async (req, res) => {
  const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string, 10) : undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const conditions = [];
  if (supplierId) conditions.push(eq(purchaseInvoicesTable.supplierId, supplierId));
  if (from) conditions.push(gte(purchaseInvoicesTable.date, from));
  if (to) conditions.push(lte(purchaseInvoicesTable.date, to));

  const rows = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(purchaseInvoicesTable.date), desc(purchaseInvoicesTable.id));

  const result = await Promise.all(
    rows.map(async (inv) => {
      const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, inv.supplierId));
      return {
        id: inv.id,
        supplierId: inv.supplierId,
        supplierName: s?.name ?? "",
        date: toDateStr(inv.date),
        invoiceNo: inv.invoiceNo ?? null,
        totalAmount: parseFloat(inv.totalAmount),
        paidAmount: parseFloat(inv.paidAmount),
        balance: parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount),
        paymentMode: inv.paymentMode,
        notes: inv.notes ?? null,
        createdAt: inv.createdAt,
      };
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
        source: "manual",
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
  res.status(201).json({
    id: result.id,
    supplierId: result.supplierId,
    supplierName: s?.name ?? "",
    date: toDateStr(result.date),
    invoiceNo: result.invoiceNo ?? null,
    totalAmount: parseFloat(result.totalAmount),
    paidAmount: parseFloat(result.paidAmount),
    balance: parseFloat(result.totalAmount) - parseFloat(result.paidAmount),
    paymentMode: result.paymentMode,
    notes: result.notes ?? null,
    createdAt: result.createdAt,
  });
});

// ── GET /purchases/:id ────────────────────────────────────────────────────────

router.get("/purchases/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [inv] = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Not found" }); return; }

  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, inv.supplierId));
  const items = await db
    .select()
    .from(purchaseInvoiceItemsTable)
    .where(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, id));

  const itemsWithProduct = await Promise.all(
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

  res.json({
    id: inv.id,
    supplierId: inv.supplierId,
    supplierName: s?.name ?? "",
    date: toDateStr(inv.date),
    invoiceNo: inv.invoiceNo ?? null,
    totalAmount: parseFloat(inv.totalAmount),
    paidAmount: parseFloat(inv.paidAmount),
    balance: parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount),
    paymentMode: inv.paymentMode,
    notes: inv.notes ?? null,
    createdAt: inv.createdAt,
    items: itemsWithProduct,
  });
});

// ── DELETE /purchases/:id ─────────────────────────────────────────────────────

router.delete("/purchases/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.transaction(async (tx) => {
    // Remove cashbook entries that were auto-created for this purchase
    await tx
      .delete(cashbookEntriesTable)
      .where(and(eq(cashbookEntriesTable.source, "manual"), eq(cashbookEntriesTable.referenceId, id)));
    await tx.delete(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, id));
  });

  res.status(204).send();
});

export default router;
