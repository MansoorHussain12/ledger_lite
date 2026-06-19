import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const VALID_TYPES = ["category", "unit"] as const;
type LookupType = (typeof VALID_TYPES)[number];

function isValidType(t: string): t is LookupType {
  return VALID_TYPES.includes(t as LookupType);
}

router.get("/lookups/:type", requireAuth, async (req, res): Promise<void> => {
  const type = String(req.params.type);
  if (!isValidType(type)) { res.status(400).json({ error: "Invalid type. Must be 'category' or 'unit'" }); return; }
  const { rows } = await pool.query(
    "SELECT id, type, value, created_at FROM lookup_values WHERE type=$1 ORDER BY value ASC",
    [type]
  );
  res.json(rows.map(r => ({ id: r.id, type: r.type, value: r.value, createdAt: r.created_at })));
});

router.post("/lookups/:type", requireAuth, requireRole("owner"), async (req, res): Promise<void> => {
  const type = String(req.params.type);
  if (!isValidType(type)) { res.status(400).json({ error: "Invalid type. Must be 'category' or 'unit'" }); return; }
  const Body = z.object({ value: z.string().min(1).max(100) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const { rows } = await pool.query(
      "INSERT INTO lookup_values (type, value) VALUES ($1, $2) RETURNING id, type, value, created_at",
      [type, parsed.data.value.trim()]
    );
    res.status(201).json({ id: rows[0].id, type: rows[0].type, value: rows[0].value, createdAt: rows[0].created_at });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      res.status(409).json({ error: "Value already exists" });
      return;
    }
    throw err;
  }
});

router.patch("/lookups/:type/:id", requireAuth, requireRole("owner"), async (req, res): Promise<void> => {
  const type = String(req.params.type);
  if (!isValidType(type)) { res.status(400).json({ error: "Invalid type. Must be 'category' or 'unit'" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const Body = z.object({ value: z.string().min(1).max(100) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const oldRow = await pool.query("SELECT value FROM lookup_values WHERE id=$1 AND type=$2", [id, type]);
  if (!oldRow.rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const oldValue = oldRow.rows[0].value as string;
  const newValue = parsed.data.value.trim();
  try {
    const { rows } = await pool.query(
      "UPDATE lookup_values SET value=$1 WHERE id=$2 AND type=$3 RETURNING id, type, value, created_at",
      [newValue, id, type]
    );
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    // Also update existing products that use the old value
    if (type === "category") {
      await pool.query("UPDATE products SET category=$1 WHERE category=$2", [newValue, oldValue]);
    } else if (type === "unit") {
      await pool.query("UPDATE products SET unit=$1 WHERE unit=$2", [newValue, oldValue]);
    }
    res.json({ id: rows[0].id, type: rows[0].type, value: rows[0].value, createdAt: rows[0].created_at });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      res.status(409).json({ error: "Value already exists" });
      return;
    }
    throw err;
  }
});

router.delete("/lookups/:type/:id", requireAuth, requireRole("owner"), async (req, res): Promise<void> => {
  const type = String(req.params.type);
  if (!isValidType(type)) { res.status(400).json({ error: "Invalid type. Must be 'category' or 'unit'" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await pool.query("SELECT value FROM lookup_values WHERE id=$1 AND type=$2", [id, type]);
  if (!row.rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const value = row.rows[0].value as string;
  // Check if any products reference this value
  if (type === "category") {
    const inUse = await pool.query("SELECT COUNT(*) FROM products WHERE category=$1", [value]);
    if (parseInt(inUse.rows[0].count) > 0) {
      res.status(409).json({ error: `Cannot delete — ${inUse.rows[0].count} product(s) still use this category` });
      return;
    }
  } else if (type === "unit") {
    const inUse = await pool.query("SELECT COUNT(*) FROM products WHERE unit=$1", [value]);
    if (parseInt(inUse.rows[0].count) > 0) {
      res.status(409).json({ error: `Cannot delete — ${inUse.rows[0].count} product(s) still use this unit` });
      return;
    }
  }
  await pool.query("DELETE FROM lookup_values WHERE id=$1", [id]);
  res.sendStatus(204);
});

export default router;
