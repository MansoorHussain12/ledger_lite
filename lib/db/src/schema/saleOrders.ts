import { pgTable, serial, text, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { productsTable } from "./products";

export const saleOrdersTable = pgTable("sale_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "restrict" }),
  date: date("date").notNull(),
  vehicleNo: text("vehicle_no"),
  driverName: text("driver_name"),
  billtyNo: text("billty_no"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const saleOrderItemsTable = pgTable("sale_order_items", {
  id: serial("id").primaryKey(),
  saleOrderId: integer("sale_order_id").notNull().references(() => saleOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
});

export const insertSaleOrderSchema = createInsertSchema(saleOrdersTable).omit({ id: true, createdAt: true });
export type InsertSaleOrder = z.infer<typeof insertSaleOrderSchema>;
export type SaleOrder = typeof saleOrdersTable.$inferSelect;
export type SaleOrderItem = typeof saleOrderItemsTable.$inferSelect;
