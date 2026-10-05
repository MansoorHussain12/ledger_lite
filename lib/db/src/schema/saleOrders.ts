import { pgTable, serial, text, timestamp, numeric, integer, date, index, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  // Flat-amount discount agreed at sale time, e.g. rounding a bill down. Kept separate
  // from totalAmount (which always stays sum(item.amount) — see saleOrders.ts's
  // resolveItems) rather than baked into it, mirroring how sale returns are tracked as
  // their own satellite adjustment rather than mutating the order row. Net amount owed
  // for the order is totalAmount - discountAmount.
  discountAmount: numeric("discount_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // Invoice snapshot of the customer's balance immediately before this order posted —
  // computed server-side at creation time (see computeCustomerBalance) and frozen from
  // then on, so a reprinted invoice stays accurate even after later orders/payments/
  // corrections move the customer's current balance. Null for rows created before this
  // column existed.
  previousBalance: numeric("previous_balance", { precision: 14, scale: 2 }),
  // Amount the customer paid at the time this order was created, if any (optional — an
  // unpaid order just adds to their outstanding balance). This is a display snapshot
  // only, for reprinting the invoice later — the actual cash receipt is still a normal
  // row in payments (and its own cashbook entry); this column doesn't post anywhere.
  receivedAmount: numeric("received_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paymentMode: text("payment_mode").$type<"cash" | "bank" | "cheque">(),
  bankAccount: text("bank_account"),
  chequeNo: text("cheque_no"),
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
}, (table) => [
  // Balance computation (computeCustomerBalances) and the aging/outstanding reports
  // always filter by customerId + status together — without this, both do a full
  // table scan per query as sale_orders grows.
  index("sale_orders_customer_status_idx").on(table.customerId, table.status),
  // Date-range reports (monthly-sales, dashboard profit breakdown) filter by date + status.
  index("sale_orders_date_status_idx").on(table.date, table.status),
]);

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
}, (table) => [
  // Every order-detail lookup (single order page, GET /sale-orders list, dashboard
  // profit breakdown) filters/joins on saleOrderId — no index existed beyond the PK.
  index("sale_order_items_sale_order_id_idx").on(table.saleOrderId),
]);

export const insertSaleOrderSchema = createInsertSchema(saleOrdersTable).omit({ id: true, createdAt: true });
export type InsertSaleOrder = z.infer<typeof insertSaleOrderSchema>;
export type SaleOrder = typeof saleOrdersTable.$inferSelect;
export type SaleOrderItem = typeof saleOrderItemsTable.$inferSelect;
