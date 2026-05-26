import { Router, type IRouter } from "express";
import { db, productsTable, productRatesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateProductBody,
  GetProductParams,
  UpdateProductParams,
  UpdateProductBody,
  DeleteProductParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(productsTable).orderBy(productsTable.name);
  res.json(rows.map(p => ({
    id: p.id, name: p.name, currentRate: parseFloat(p.currentRate),
    costPrice: p.costPrice ? parseFloat(p.costPrice) : null, createdAt: p.createdAt,
  })));
});

router.post("/products", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { name, currentRate, costPrice } = parsed.data;
  const [p] = await db.insert(productsTable).values({
    name, currentRate: String(currentRate), costPrice: costPrice != null ? String(costPrice) : null,
  }).returning();
  // Log initial rate
  await db.insert(productRatesTable).values({ productId: p.id, rate: p.currentRate, effectiveDate: new Date().toISOString().split("T")[0] });
  res.status(201).json({ id: p.id, name: p.name, currentRate: parseFloat(p.currentRate), costPrice: p.costPrice ? parseFloat(p.costPrice) : null, createdAt: p.createdAt });
});

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!p) { res.status(404).json({ error: "Product not found" }); return; }
  res.json({ id: p.id, name: p.name, currentRate: parseFloat(p.currentRate), costPrice: p.costPrice ? parseFloat(p.costPrice) : null, createdAt: p.createdAt });
});

router.patch("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.currentRate != null) updates.currentRate = String(parsed.data.currentRate);
  if (parsed.data.costPrice !== undefined) updates.costPrice = parsed.data.costPrice != null ? String(parsed.data.costPrice) : null;
  const [p] = await db.update(productsTable).set(updates).where(eq(productsTable.id, params.data.id)).returning();
  if (!p) { res.status(404).json({ error: "Product not found" }); return; }
  // Log rate change if rate changed
  if (parsed.data.currentRate != null) {
    await db.insert(productRatesTable).values({ productId: p.id, rate: p.currentRate, effectiveDate: new Date().toISOString().split("T")[0] });
  }
  res.json({ id: p.id, name: p.name, currentRate: parseFloat(p.currentRate), costPrice: p.costPrice ? parseFloat(p.costPrice) : null, createdAt: p.createdAt });
});

router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/products/:id/rates", requireAuth, async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const rates = await db.select().from(productRatesTable)
    .where(eq(productRatesTable.productId, params.data.id))
    .orderBy(desc(productRatesTable.effectiveDate));
  res.json(rates.map(r => ({ id: r.id, productId: r.productId, rate: parseFloat(r.rate), effectiveDate: r.effectiveDate })));
});

export default router;
