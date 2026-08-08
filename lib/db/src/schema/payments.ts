import { pgTable, serial, text, timestamp, numeric, integer, date, pgEnum, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const paymentTypeEnum = pgEnum("payment_type", ["cash", "bank"]);

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "restrict" }),
  date: date("date").notNull(),
  type: paymentTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  bankAccount: text("bank_account"),
  chequeNo: text("cheque_no"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Correction workflow — see saleOrdersTable.status for the full explanation. Same
  // three-column pattern: 'posted' | 'reversed' | 'reversal', with reversesId/correctsId
  // linking a reversal/correction row back to the original it relates to.
  status: text("status").$type<"posted" | "reversed" | "reversal">().notNull().default("posted"),
  reversesId: integer("reverses_id").references((): AnyPgColumn => paymentsTable.id),
  correctsId: integer("corrects_id").references((): AnyPgColumn => paymentsTable.id),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
