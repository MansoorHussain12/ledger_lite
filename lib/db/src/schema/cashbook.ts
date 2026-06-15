import { pgTable, serial, text, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const cashbookEntriesTable = pgTable("cashbook_entries", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  type: text("type").$type<"cash_in" | "cash_out">().notNull(),
  source: text("source")
    .$type<"manual" | "payment" | "expense" | "opening_balance" | "adjustment" | "salary" | "transfer">()
    .notNull()
    .default("manual"),
  referenceId: integer("reference_id"),
  description: text("description").notNull(),
  paymentMode: text("payment_mode")
    .$type<"cash" | "bank" | "easypaisa" | "jazzcash" | "cheque" | "other">()
    .notNull()
    .default("cash"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  category: text("category").notNull().default("General"),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMode: text("payment_mode")
    .$type<"cash" | "bank" | "easypaisa" | "jazzcash" | "cheque" | "other">()
    .notNull()
    .default("cash"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CashbookEntry = typeof cashbookEntriesTable.$inferSelect;
export type Expense = typeof expensesTable.$inferSelect;
