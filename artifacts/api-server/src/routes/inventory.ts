import { Router } from "express";
import { db } from "@workspace/db";
import {
  productsTable,
  purchaseInvoiceItemsTable,
  purchaseInvoicesTable,
  saleOrderItemsTable,
  saleOrdersTable,
  stockAdjustmentsTable,
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

  const [purchAgg] = await db
    .select({ total: sql<string>`coalesce(sum(${purchaseInvoiceItemsTable.qty}),0)` })
    .from(purchaseInvoiceItemsTable)
    .where(eq(purchaseInvoiceItemsTable.productId, productId));

  const [saleAgg] = await db
    .select({ total: sql<string>`coalesce(sum(${saleOrderItemsTable.qty}),0)` })
    .from(saleOrderItemsTable)
    .where(eq(saleOrderItemsTable.productId, productId));

  const [adjAgg] = await db
    .select({ total: sql<string>`coalesce(sum(${stockAdjustmentsTable.qty}),0)` })
    .from(stockAdjustmentsTable)
    .where(eq(stockAdjustmentsTable.productId, productId));

  const opening = parseFloat(p.openingStock ?? "0");
  const purchased = parseFloat(purchAgg?.total ?? "0");
  const sold = parseFloat(saleAgg?.total ?? "0");
  const adjusted = parseFloat(adjAgg?.total ?? "0");
  const current = Math.round((opening + purchased - sold + adjusted) * 100) / 100;
  const minStock = parseFloat(p.minStock ?? "0");

  return {
    opening, purchased, sold, adjusted, current, minStock,
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

  // Purchases
  const purchItems = await db
    .select()
    .from(purchaseInvoiceItemsTable)
    .where(eq(purchaseInvoiceItemsTable.productId, productId));

  const purchMovements = await Promise.all(purchItems.map(async (item) => {
    const [inv] = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.id, item.purchaseInvoiceId));
    return {
      id: `p-${item.id}`, type: "in" as const,
      date: inv ? toDateStr(inv.date) : "",
      qty: parseFloat(item.qty),
      ref: inv?.invoiceNo ? `Purch #${inv.invoiceNo}` : `Purchase #${item.purchaseInvoiceId}`,
      notes: null,
    };
  }));

  // Sales
  const saleItems = await db
    .select()
    .from(saleOrderItemsTable)
    .where(eq(saleOrderItemsTable.productId, productId));

  const saleMovements = await Promise.all(saleItems.map(async (item) => {
    const [order] = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, item.saleOrderId));
    return {
      id: `s-${item.id}`, type: "out" as const,
      date: order ? toDateStr(order.date) : "",
      qty: parseFloat(item.qty),
      ref: `Sale Order #${item.saleOrderId}`,
      notes: null,
    };
  }));

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

  // Opening stock as first entry
  const opening = parseFloat(p.openingStock ?? "0");
  const openingEntry = opening !== 0 ? [{
    id: "opening", type: "opening" as const,
    date: "", qty: opening, ref: "Opening Stock", notes: null,
  }] : [];

  const all = [...openingEntry, ...purchMovements, ...saleMovements, ...adjMovements]
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
