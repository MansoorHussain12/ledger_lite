import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  const { rows } = await pool.query("SELECT * FROM company_settings ORDER BY id LIMIT 1");
  if (!rows.length) {
    res.json({ companyName: "My Company", tagline: "Building Materials Supplier", businessType: "Building Materials", currency: "Rs", logoData: null, logoScale: 100, address: "", phone: "", email: "" });
    return;
  }
  const r = rows[0];
  res.json({
    companyName: r.company_name,
    tagline: r.tagline,
    businessType: r.business_type,
    currency: r.currency,
    logoData: r.logo_data ?? null,
    logoScale: r.logo_scale ?? 100,
    address: r.address ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
  });
});

router.put("/settings", requireAuth, requireRole("owner"), async (req, res): Promise<void> => {
  const Body = z.object({
    companyName: z.string().min(1).max(100).optional(),
    tagline: z.string().max(200).optional(),
    businessType: z.string().max(100).optional(),
    currency: z.string().max(10).optional(),
    logoData: z.string().nullable().optional(),
    logoScale: z.number().int().min(30).max(300).optional(),
    address: z.string().max(300).optional(),
    phone: z.string().max(100).optional(),
    email: z.string().max(200).optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { companyName, tagline, businessType, currency, logoData, logoScale, address, phone, email } = parsed.data;

  const { rows } = await pool.query("SELECT * FROM company_settings ORDER BY id LIMIT 1");
  if (!rows.length) {
    await pool.query(
      "INSERT INTO company_settings (company_name, tagline, business_type, currency, logo_data, logo_scale, address, phone, email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [companyName ?? "My Company", tagline ?? "", businessType ?? "Building Materials", currency ?? "Rs", logoData ?? null, logoScale ?? 100, address ?? "", phone ?? "", email ?? ""]
    );
  } else {
    const r = rows[0];
    await pool.query(
      `UPDATE company_settings SET
        company_name=$1, tagline=$2, business_type=$3, currency=$4,
        logo_data=$5, logo_scale=$6, address=$7, phone=$8, email=$9, updated_at=NOW()
       WHERE id=$10`,
      [
        companyName      !== undefined ? companyName      : r.company_name,
        tagline          !== undefined ? tagline          : r.tagline,
        businessType     !== undefined ? businessType     : r.business_type,
        currency         !== undefined ? currency         : r.currency,
        logoData         !== undefined ? logoData         : r.logo_data,
        logoScale        !== undefined ? logoScale        : r.logo_scale,
        address          !== undefined ? address          : r.address,
        phone            !== undefined ? phone            : r.phone,
        email            !== undefined ? email            : r.email,
        r.id,
      ]
    );
  }

  const { rows: up } = await pool.query("SELECT * FROM company_settings ORDER BY id LIMIT 1");
  const u = up[0];
  res.json({ companyName: u.company_name, tagline: u.tagline, businessType: u.business_type, currency: u.currency, logoData: u.logo_data ?? null, logoScale: u.logo_scale ?? 100, address: u.address ?? "", phone: u.phone ?? "", email: u.email ?? "" });
});

export default router;
