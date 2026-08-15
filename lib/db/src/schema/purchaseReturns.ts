import { pgTable, serial, text, timestamp, numeric, integer, date, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable, purchaseInvoicesTable, purchaseInvoiceItemsTable } from "./purchases";
import { productsTable } from "./products";
import { usersTable } from "./users";

// A purchase return is always tied to one specific original purchase invoice — mirrors
// saleReturnsTable exactly, with signs flipped: returning goods to a supplier reduces what
// we owe them, and any cash refund received back is money entering the business (cash_in),
// not leaving it. See saleReturns.ts for the full design rationale.
export const purchaseReturnsTable = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  purchaseInvoiceId: integer("purchase_invoice_id").notNull().references(() => purchaseInvoicesTable.id, { onDelete: "restrict" }),
  // Denormalized from the invoice at creation time, mirroring purchase_invoices' own
  // supplierId — avoids joining through purchase_invoices for balance/ledger queries.
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "restrict" }),
  date: date("date").notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // Optional immediate cash refund received back from the supplier. When > 0, auto-posts a
  // cash_in cashbook entry (source: "purchase_return"), reversed/reposted by
  // /purchase-returns/:id/correct exactly the way a purchase's paidAmount already is.
  refundReceived: numeric("refund_received", { precision: 14, scale: 2 }).notNull().default("0"),
  refundMode: text("refund_mode")
    .$type<"cash" | "bank" | "easypaisa" | "jazzcash" | "cheque" | "other">()
    .notNull()
    .default("cash"),
  reason: text("reason"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Correction workflow — see saleOrdersTable.status for the full explanation.
  status: text("status").$type<"posted" | "reversed" | "reversal">().notNull().default("posted"),
  reversesId: integer("reverses_id").references((): AnyPgColumn => purchaseReturnsTable.id),
  correctsId: integer("corrects_id").references((): AnyPgColumn => purchaseReturnsTable.id),
});

export const purchaseReturnItemsTable = pgTable("purchase_return_items", {
  id: serial("id").primaryKey(),
  purchaseReturnId: integer("purchase_return_id").notNull().references(() => purchaseReturnsTable.id, { onDelete: "cascade" }),
  // Pins this line to the exact original purchase invoice item it credits — see
  // saleReturnItemsTable.saleOrderItemId for the equivalent rationale.
  purchaseInvoiceItemId: integer("purchase_invoice_item_id").notNull().references(() => purchaseInvoiceItemsTable.id, { onDelete: "restrict" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
});

export const insertPurchaseReturnSchema = createInsertSchema(purchaseReturnsTable).omit({ id: true, createdAt: true });
export type InsertPurchaseReturn = z.infer<typeof insertPurchaseReturnSchema>;
export type PurchaseReturn = typeof purchaseReturnsTable.$inferSelect;
export type PurchaseReturnItem = typeof purchaseReturnItemsTable.$inferSelect;
