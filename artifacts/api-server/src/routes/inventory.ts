import { Router } from "express";
import { db } from "@workspace/db";
import {
  productsTable,
  purchaseInvoiceItemsTable,
  purchaseInvoicesTable,
  saleOrderItemsTable,
  saleOrdersTable,
  stockAdjustmentsTable,
  saleReturnsTable,
  saleReturnItemsTable,
  purchaseReturnsTable,
  purchaseReturnItemsTable,
} from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function toDateStr(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d);
}

// ── stock calculation helper ─────────────────────────────────────────────────

async function calcStock(productId: number) {
  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!p) return null;

  // Join to the parent invoice/order and filter to "live" (posted) rows — a reversed
  // purchase/sale and its reversal mirror both have their own item rows with the same
  // qty, so without this filter a correction would double-count instead of netting out
  // (see the correction workflow).
  const [purchAgg] = await db
    .select({ total: sql<string>`coalesce(sum(${purchaseInvoiceItemsTable.qty}),0)` })
    .from(purchaseInvoiceItemsTable)
    .innerJoin(purchaseInvoicesTable, eq(purchaseInvoiceItemsTable.purchaseInvoiceId, purchaseInvoicesTable.id))
    .where(and(eq(purchaseInvoiceItemsTable.productId, productId), eq(purchaseInvoicesTable.status, "posted")));

  const [saleAgg] = await db
    .select({ total: sql<string>`coalesce(sum(${saleOrderItemsTable.qty}),0)` })
    .from(saleOrderItemsTable)
    .innerJoin(saleOrdersTable, eq(saleOrderItemsTable.saleOrderId, saleOrdersTable.id))
    .where(and(eq(saleOrderItemsTable.productId, productId), eq(saleOrdersTable.status, "posted")));

  const [adjAgg] = await db
    .select({ total: sql<string>`coalesce(sum(${stockAdjustmentsTable.qty}),0)` })
    .from(stockAdjustmentsTable)
    .where(eq(stockAdjustmentsTable.productId, productId));

  // Sale returns bring goods back into stock; purchase returns send them back out —
  // same posted-status-filtered netting as the purchase/sale aggregates above.
  const [saleRetAgg] = await db
    .select({ total: sql<string>`coalesce(sum(${saleReturnItemsTable.qty}),0)` })
    .from(saleReturnItemsTable)
    .innerJoin(saleReturnsTable, eq(saleReturnItemsTable.saleReturnId, saleReturnsTable.id))
    .where(and(eq(saleReturnItemsTable.productId, productId), eq(saleReturnsTable.status, "posted")));

  const [purchRetAgg] = await db
    .select({ total: sql<string>`coalesce(sum(${purchaseReturnItemsTable.qty}),0)` })
    .from(purchaseReturnItemsTable)
    .innerJoin(purchaseReturnsTable, eq(purchaseReturnItemsTable.purchaseReturnId, purchaseReturnsTable.id))
    .where(and(eq(purchaseReturnItemsTable.productId, productId), eq(purchaseReturnsTable.status, "posted")));

  const opening = parseFloat(p.openingStock ?? "0");
  const purchased = parseFloat(purchAgg?.total ?? "0");
  const sold = parseFloat(saleAgg?.total ?? "0");
  const adjusted = parseFloat(adjAgg?.total ?? "0");
  const salesReturned = parseFloat(saleRetAgg?.total ?? "0");
  const purchasesReturned = parseFloat(purchRetAgg?.total ?? "0");
  const current = Math.round((opening + purchased - sold + adjusted + salesReturned - purchasesReturned) * 100) / 100;
  const minStock = parseFloat(p.minStock ?? "0");

  return {
    opening, purchased, sold, adjusted, salesReturned, purchasesReturned, current, minStock,
    status: current <= 0 ? "out" as const
      : (minStock > 0 && current <= minStock) ? "low" as const
        : "ok" as const,
  };
}

// ── GET /inventory ────────────────────────────────────────────────────────────

router.get("/inventory", requireAuth, async (req, res) => {
  const categoryFilter = req.query.category ? String(req.query.category) : null;
  const products = await db.select().from(productsTable).orderBy(productsTable.name);
  const filtered = categoryFilter
    ? products.filter(p => p.category === categoryFilter)
    : products;
  const rows = await Promise.all(filtered.map(async (p) => {
    const stock = await calcStock(p.id);
    return {
      id: p.id,
      name: p.name,
      category: p.category ?? null,
      unit: p.unit ?? null,
      currentRate: parseFloat(p.currentRate),
      costPrice: p.costPrice ? parseFloat(p.costPrice) : null,
      openingStock: parseFloat(p.openingStock ?? "0"),
      minStock: parseFloat(p.minStock ?? "0"),
      purchased: stock?.purchased ?? 0,
      sold: stock?.sold ?? 0,
      adjusted: stock?.adjusted ?? 0,
      salesReturned: stock?.salesReturned ?? 0,
      purchasesReturned: stock?.purchasesReturned ?? 0,
      currentStock: stock?.current ?? 0,
      status: stock?.status ?? "ok",
    };
  }));
  res.json(rows);
});

// ── GET /inventory/:productId/movements ───────────────────────────────────────

router.get("/inventory/:productId/movements", requireAuth, async (req, res) => {
  const productId = parseInt(String(req.params.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!p) { res.status(404).json({ error: "Product not found" }); return; }

  // Purchases — only from "live" (posted) invoices; a reversed/corrected purchase and
  // its reversal mirror are both excluded, so movement history reflects the correction,
  // not the mistake (see the correction workflow).
  const purchItems = await db
    .select()
    .from(purchaseInvoiceItemsTable)
    .where(eq(purchaseInvoiceItemsTable.productId, productId));

  const purchMovements = (await Promise.all(purchItems.map(async (item) => {
    const [inv] = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, item.purchaseInvoiceId));
    if (!inv || inv.status !== "posted") return null;
    return {
      id: `p-${item.id}`, type: "in" as const,
      date: toDateStr(inv.date),
      qty: parseFloat(item.qty),
      ref: inv.invoiceNo ? `Purch #${inv.invoiceNo}` : `Purchase #${item.purchaseInvoiceId}`,
      notes: null,
    };
  }))).filter((m): m is NonNullable<typeof m> => m != null);

  // Sales — same "live" (posted) filter.
  const saleItems = await db
    .select()
    .from(saleOrderItemsTable)
    .where(eq(saleOrderItemsTable.productId, productId));

  const saleMovements = (await Promise.all(saleItems.map(async (item) => {
    const [order] = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, item.saleOrderId));
    if (!order || order.status !== "posted") return null;
    return {
      id: `s-${item.id}`, type: "out" as const,
      date: toDateStr(order.date),
      qty: parseFloat(item.qty),
      ref: `Sale Order #${item.saleOrderId}`,
      notes: null,
    };
  }))).filter((m): m is NonNullable<typeof m> => m != null);

  // Adjustments
  const adjs = await db
    .select()
    .from(stockAdjustmentsTable)
    .where(eq(stockAdjustmentsTable.productId, productId));

  const adjMovements = adjs.map(a => ({
    id: `a-${a.id}`,
    type: parseFloat(a.qty) >= 0 ? "adj_in" as const : "adj_out" as const,
    date: toDateStr(a.date),
    qty: Math.abs(parseFloat(a.qty)),
    ref: a.reason,
    notes: a.notes ?? null,
    adjustmentId: a.id,
  }));

  // Sale returns — goods coming back in — same "live" (posted) filter as purchases/sales.
  const saleReturnItems = await db
    .select()
    .from(saleReturnItemsTable)
    .where(eq(saleReturnItemsTable.productId, productId));

  const saleReturnMovements = (await Promise.all(saleReturnItems.map(async (item) => {
    const [ret] = await db.select().from(saleReturnsTable).where(eq(saleReturnsTable.id, item.saleReturnId));
    if (!ret || ret.status !== "posted") return null;
    return {
      id: `sr-${item.id}`, type: "in" as const,
      date: toDateStr(ret.date),
      qty: parseFloat(item.qty),
      ref: `Sale Return (SO-${ret.saleOrderId})`,
      notes: null,
    };
  }))).filter((m): m is NonNullable<typeof m> => m != null);

  // Purchase returns — goods going back out — same "live" (posted) filter.
  const purchReturnItems = await db
    .select()
    .from(purchaseReturnItemsTable)
    .where(eq(purchaseReturnItemsTable.productId, productId));

  const purchReturnMovements = (await Promise.all(purchReturnItems.map(async (item) => {
    const [ret] = await db.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, item.purchaseReturnId));
    if (!ret || ret.status !== "posted") return null;
    return {
      id: `pr-${item.id}`, type: "out" as const,
      date: toDateStr(ret.date),
      qty: parseFloat(item.qty),
      ref: `Purchase Return (PUR-${ret.purchaseInvoiceId})`,
      notes: null,
    };
  }))).filter((m): m is NonNullable<typeof m> => m != null);

  // Opening stock as first entry
  const opening = parseFloat(p.openingStock ?? "0");
  const openingEntry = opening !== 0 ? [{
    id: "opening", type: "opening" as const,
    date: "", qty: opening, ref: "Opening Stock", notes: null,
  }] : [];

  const all = [...openingEntry, ...purchMovements, ...saleMovements, ...adjMovements, ...saleReturnMovements, ...purchReturnMovements]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Add running balance
  let running = 0;
  const withBalance = all.map(m => {
    if (m.type === "in" || m.type === "adj_in" || m.type === "opening") running += m.qty;
    else running -= m.qty;
    return { ...m, balance: Math.round(running * 100) / 100 };
  });

  const stock = await calcStock(productId);

  res.json({
    product: {
      id: p.id, name: p.name,
      currentRate: parseFloat(p.currentRate),
      costPrice: p.costPrice ? parseFloat(p.costPrice) : null,
      openingStock: opening,
      minStock: parseFloat(p.minStock ?? "0"),
      currentStock: stock?.current ?? 0,
      status: stock?.status ?? "ok",
    },
    movements: withBalance,
  });
});

// ── PATCH /inventory/:productId/settings ──────────────────────────────────────

const settingsSchema = z.object({
  openingStock: z.coerce.number().min(0).optional(),
  minStock: z.coerce.number().min(0).optional(),
});

router.patch("/inventory/:productId/settings", requireAuth, async (req, res) => {
  const productId = parseInt(String(req.params.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed" }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.openingStock != null) updates.openingStock = String(parsed.data.openingStock);
  if (parsed.data.minStock != null) updates.minStock = String(parsed.data.minStock);
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [p] = await db.update(productsTable).set(updates).where(eq(productsTable.id, productId)).returning();
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: p.id, openingStock: parseFloat(p.openingStock ?? "0"), minStock: parseFloat(p.minStock ?? "0") });
});

// ── POST /inventory/adjustments ───────────────────────────────────────────────

const adjustmentSchema = z.object({
  productId: z.number().int().positive(),
  date: z.string().min(1),
  qty: z.number().refine(v => v !== 0, "Qty cannot be zero"),
  reason: z.string().min(1).default("Manual Adjustment"),
  notes: z.string().optional(),
});

router.post("/inventory/adjustments", requireAuth, async (req, res) => {
  const parsed = adjustmentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.issues }); return; }
  const userId = (req.session as any)?.userId ?? null;
  const [adj] = await db.insert(stockAdjustmentsTable).values({
    productId: parsed.data.productId,
    date: parsed.data.date,
    qty: String(parsed.data.qty),
    reason: parsed.data.reason,
    notes: parsed.data.notes ?? null,
    createdById: userId,
  }).returning();
  res.status(201).json({ ...adj, qty: parseFloat(adj.qty) });
});

// ── DELETE /inventory/adjustments/:id ────────────────────────────────────────

router.delete("/inventory/adjustments/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(stockAdjustmentsTable).where(eq(stockAdjustmentsTable.id, id));
  res.status(204).send();
});

export default router;
