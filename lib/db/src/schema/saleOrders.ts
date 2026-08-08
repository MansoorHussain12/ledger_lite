import { pgTable, serial, text, timestamp, numeric, integer, date, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  // Correction workflow: a posted transaction is never edited or deleted in place.
  // 'posted' = live, counts toward balances/reports. 'reversed' = the original mistaken
  // entry, superseded — excluded from balances but kept visible in history.
  // 'reversal' = the paper-trail entry that cancels a reversed row — also excluded from
  // balances. reversesId (on a 'reversal' row) and correctsId (on the new 'posted'
  // replacement row) both point back at the original row they relate to.
  status: text("status").$type<"posted" | "reversed" | "reversal">().notNull().default("posted"),
  reversesId: integer("reverses_id").references((): AnyPgColumn => saleOrdersTable.id),
  correctsId: integer("corrects_id").references((): AnyPgColumn => saleOrdersTable.id),
});

export const saleOrderItemsTable = pgTable("sale_order_items", {
  id: serial("id").primaryKey(),
  saleOrderId: integer("sale_order_id").notNull().references(() => saleOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
  // Snapshot of the product's cost price at the moment of sale — never user-entered,
  // captured automatically so historical profit stays frozen even if the product's
  // cost price changes later. Null on rows created before this column existed.
  costPrice: numeric("cost_price", { precision: 14, scale: 2 }),
});

export const insertSaleOrderSchema = createInsertSchema(saleOrdersTable).omit({ id: true, createdAt: true });
export type InsertSaleOrder = z.infer<typeof insertSaleOrderSchema>;
export type SaleOrder = typeof saleOrdersTable.$inferSelect;
export type SaleOrderItem = typeof saleOrderItemsTable.$inferSelect;
