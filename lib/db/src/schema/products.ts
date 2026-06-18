import { pgTable, serial, text, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  currentRate: numeric("current_rate", { precision: 14, scale: 2 }).notNull(),
  costPrice: numeric("cost_price", { precision: 14, scale: 2 }),
  openingStock: numeric("opening_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  minStock: numeric("min_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  unit: text("unit").notNull().default("bag"),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productRatesTable = pgTable("product_rates", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
export type ProductRate = typeof productRatesTable.$inferSelect;
