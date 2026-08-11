import { pgTable, serial, text, timestamp, numeric, integer, date, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./purchases";
import { usersTable } from "./users";

// Standalone payments made to a supplier, independent of any single purchase invoice —
// mirrors paymentsTable (customer receipts), but paymentMode uses the same richer 6-value
// set as purchaseInvoicesTable/cashbookEntriesTable rather than the customer side's cash/bank.
export const supplierPaymentsTable = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "restrict" }),
  date: date("date").notNull(),
  paymentMode: text("payment_mode")
    .$type<"cash" | "bank" | "easypaisa" | "jazzcash" | "cheque" | "other">()
    .notNull()
    .default("cash"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  bankAccount: text("bank_account"),
  chequeNo: text("cheque_no"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Correction workflow — see saleOrdersTable.status for the full explanation. Same
  // three-column pattern: 'posted' | 'reversed' | 'reversal', with reversesId/correctsId
  // linking a reversal/correction row back to the original it relates to.
  status: text("status").$type<"posted" | "reversed" | "reversal">().notNull().default("posted"),
  reversesId: integer("reverses_id").references((): AnyPgColumn => supplierPaymentsTable.id),
  correctsId: integer("corrects_id").references((): AnyPgColumn => supplierPaymentsTable.id),
});

export const insertSupplierPaymentSchema = createInsertSchema(supplierPaymentsTable).omit({ id: true, createdAt: true });
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;
export type SupplierPayment = typeof supplierPaymentsTable.$inferSelect;
