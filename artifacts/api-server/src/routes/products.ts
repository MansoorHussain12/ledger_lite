import { Router, type IRouter } from "express";
import { db, productsTable, productRatesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const toProduct = (p: typeof productsTable.$inferSelect) => ({
  id: p.id,
  name: p.name,
  currentRate: parseFloat(p.currentRate),
  costPrice: p.costPrice ? parseFloat(p.costPrice) : null,
  openingStock: parseFloat(p.openingStock),
  minStock: parseFloat(p.minStock),
  unit: p.unit,
  category: p.category ?? null,
  createdAt: p.createdAt,
});

router.get("/products", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(productsTable).orderBy(productsTable.name);
  res.json(rows.map(toProduct));
});

router.post("/products", requireAuth, async (req, res): Promise<void> => {
  const Body = z.object({
    name: z.string().min(1),
    currentRate: z.number().positive(),
    costPrice: z.number().nonnegative().optional(),
    openingStock: z.number().nonnegative().optional(),
    minStock: z.number().nonnegative().optional(),
    unit: z.string().optional(),
    category: z.string().nullable().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { name, currentRate, costPrice, openingStock, minStock, unit, category } = parsed.data;
  const [p] = await db.insert(productsTable).values({
    name,
    currentRate: String(currentRate),
    costPrice: costPrice != null ? String(costPrice) : null,
    openingStock: openingStock != null ? String(openingStock) : "0",
    minStock: minStock != null ? String(minStock) : "0",
    unit: unit ?? "bag",
    category: category ?? null,
  }).returning();
  await db.insert(productRatesTable).values({ productId: p.id, rate: p.currentRate, effectiveDate: new Date().toISOString().split("T")[0] });
  res.status(201).json(toProduct(p));
});

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!p) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(toProduct(p));
});

router.patch("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const Body = z.object({
    name: z.string().min(1).optional(),
    currentRate: z.number().positive().optional(),
    costPrice: z.number().nonnegative().nullable().optional(),
    openingStock: z.number().nonnegative().optional(),
    minStock: z.number().nonnegative().optional(),
    unit: z.string().optional(),
    category: z.string().nullable().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.currentRate != null) updates.currentRate = String(parsed.data.currentRate);
  if (parsed.data.costPrice !== undefined) updates.costPrice = parsed.data.costPrice != null ? String(parsed.data.costPrice) : null;
  if (parsed.data.openingStock != null) updates.openingStock = String(parsed.data.openingStock);
  if (parsed.data.minStock != null) updates.minStock = String(parsed.data.minStock);
  if (parsed.data.unit != null) updates.unit = parsed.data.unit;
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;
  const [p] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Product not found" }); return; }
  if (parsed.data.currentRate != null) {
    await db.insert(productRatesTable).values({ productId: p.id, rate: p.currentRate, effectiveDate: new Date().toISOString().split("T")[0] });
  }
  res.json(toProduct(p));
});

router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.sendStatus(204);
});

router.get("/products/:id/rates", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rates = await db.select().from(productRatesTable)
    .where(eq(productRatesTable.productId, id))
    .orderBy(desc(productRatesTable.effectiveDate));
  res.json(rates.map(r => ({ id: r.id, productId: r.productId, rate: parseFloat(r.rate), effectiveDate: r.effectiveDate })));
});

export default router;
