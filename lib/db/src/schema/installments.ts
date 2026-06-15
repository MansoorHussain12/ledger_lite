import { pgTable, serial, text, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { saleOrdersTable } from "./saleOrders";
import { usersTable } from "./users";

export const installmentPlansTable = pgTable("installment_plans", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "restrict" }),
  saleOrderId: integer("sale_order_id").references(() => saleOrdersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  downPayment: numeric("down_payment", { precision: 14, scale: 2 }).notNull().default("0"),
  installmentsCount: integer("installments_count").notNull().default(1),
  frequency: text("frequency").notNull().default("monthly"),
  startDate: date("start_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const installmentScheduleTable = pgTable("installment_schedule", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => installmentPlansTable.id, { onDelete: "cascade" }),
  installmentNo: integer("installment_no").notNull(),
  dueDate: date("due_date").notNull(),
  scheduledAmount: numeric("scheduled_amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const installmentPaymentsTable = pgTable("installment_payments", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => installmentPlansTable.id, { onDelete: "cascade" }),
  scheduleId: integer("schedule_id").references(() => installmentScheduleTable.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMode: text("payment_mode").notNull().default("cash"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InstallmentPlan = typeof installmentPlansTable.$inferSelect;
export type InstallmentSchedule = typeof installmentScheduleTable.$inferSelect;
export type InstallmentPayment = typeof installmentPaymentsTable.$inferSelect;
