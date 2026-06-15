import { pgTable, serial, text, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { productsTable } from "./products";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  address: text("address"),
  ntn: text("ntn"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  openingBalanceDate: date("opening_balance_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseInvoicesTable = pgTable("purchase_invoices", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "restrict" }),
  date: date("date").notNull(),
  invoiceNo: text("invoice_no"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paymentMode: text("payment_mode")
    .$type<"cash" | "bank" | "easypaisa" | "jazzcash" | "cheque" | "other">()
    .notNull()
    .default("cash"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseInvoiceItemsTable = pgTable("purchase_invoice_items", {
  id: serial("id").primaryKey(),
  purchaseInvoiceId: integer("purchase_invoice_id")
    .notNull()
    .references(() => purchaseInvoicesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "restrict" }),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
});

export type Supplier = typeof suppliersTable.$inferSelect;
export type PurchaseInvoice = typeof purchaseInvoicesTable.$inferSelect;
export type PurchaseInvoiceItem = typeof purchaseInvoiceItemsTable.$inferSelect;
