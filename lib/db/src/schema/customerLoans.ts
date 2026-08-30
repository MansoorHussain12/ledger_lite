import { pgTable, serial, text, timestamp, numeric, integer, date, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { usersTable } from "./users";

// Cash lent to a customer, with no interest — independent of any sale order. Increases
// what the customer owes (same direction as a sale), unlike a supplier payment (which
// reduces what we owe). Mirrors supplierPaymentsTable's shape exactly otherwise, including
// the same richer 6-value paymentMode set used by purchaseInvoicesTable/cashbookEntriesTable.
export const customerLoansTable = pgTable("customer_loans", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "restrict" }),
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
  reversesId: integer("reverses_id").references((): AnyPgColumn => customerLoansTable.id),
  correctsId: integer("corrects_id").references((): AnyPgColumn => customerLoansTable.id),
});

export const insertCustomerLoanSchema = createInsertSchema(customerLoansTable).omit({ id: true, createdAt: true });
export type InsertCustomerLoan = z.infer<typeof insertCustomerLoanSchema>;
export type CustomerLoan = typeof customerLoansTable.$inferSelect;
