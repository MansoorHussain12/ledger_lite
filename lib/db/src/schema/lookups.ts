import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const lookupValuesTable = pgTable("lookup_values", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LookupValue = typeof lookupValuesTable.$inferSelect;
