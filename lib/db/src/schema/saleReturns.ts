import { pgTable, serial, text, timestamp, numeric, integer, date, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { saleOrdersTable, saleOrderItemsTable } from "./saleOrders";
import { productsTable } from "./products";
import { usersTable } from "./users";

// A sale return is always tied to one specific original sale order — sale_return_items'
// saleOrderItemId pins each returned line back to the exact original item it credits, so
// returnable qty can be capped per item at (original qty − already-returned posted qty),
// the same posted-status-filtered netting calcStock uses for purchases/sales (see
// artifacts/api-server/src/routes/inventory.ts).
export const saleReturnsTable = pgTable("sale_returns", {
  id: serial("id").primaryKey(),
  saleOrderId: integer("sale_order_id").notNull().references(() => saleOrdersTable.id, { onDelete: "restrict" }),
  // Denormalized from the sale order at creation time, mirroring how purchase_invoices
  // stores supplierId directly — lets balance/ledger queries avoid joining through
  // sale_orders just to filter by customer.
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "restrict" }),
  date: date("date").notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // Optional immediate cash refund to the customer — mirrors purchaseInvoicesTable.paidAmount.
  // When > 0, auto-posts a cash_out cashbook entry (source: "sale_return"), reversed/reposted
  // by /sale-returns/:id/correct exactly the way a purchase's paidAmount already is.
  refundPaid: numeric("refund_paid", { precision: 14, scale: 2 }).notNull().default("0"),
  refundMode: text("refund_mode")
    .$type<"cash" | "bank" | "easypaisa" | "jazzcash" | "cheque" | "other">()
    .notNull()
    .default("cash"),
  reason: text("reason"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Correction workflow — see saleOrdersTable.status for the full explanation. Same
  // three-column pattern: 'posted' | 'reversed' | 'reversal', with reversesId/correctsId
  // linking a reversal/correction row back to the original it relates to.
  status: text("status").$type<"posted" | "reversed" | "reversal">().notNull().default("posted"),
  reversesId: integer("reverses_id").references((): AnyPgColumn => saleReturnsTable.id),
  correctsId: integer("corrects_id").references((): AnyPgColumn => saleReturnsTable.id),
});

export const saleReturnItemsTable = pgTable("sale_return_items", {
  id: serial("id").primaryKey(),
  saleReturnId: integer("sale_return_id").notNull().references(() => saleReturnsTable.id, { onDelete: "cascade" }),
  // Pins this line to the exact original sale order item it credits — never resolved by
  // productId alone, so a multi-line order with the same product twice can't be confused,
  // and returnable qty can be capped per original line.
  saleOrderItemId: integer("sale_order_item_id").notNull().references(() => saleOrderItemsTable.id, { onDelete: "restrict" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  // Copied from the original sale_order_item's costPrice at the moment of return (never
  // re-fetched from the product) — so profit reversal matches what was actually booked as
  // profit on the original sale, even if the product's cost price has since changed.
  costPrice: numeric("cost_price", { precision: 14, scale: 2 }),
  notes: text("notes"),
});

export const insertSaleReturnSchema = createInsertSchema(saleReturnsTable).omit({ id: true, createdAt: true });
export type InsertSaleReturn = z.infer<typeof insertSaleReturnSchema>;
export type SaleReturn = typeof saleReturnsTable.$inferSelect;
export type SaleReturnItem = typeof saleReturnItemsTable.$inferSelect;
