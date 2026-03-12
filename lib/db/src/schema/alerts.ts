import { pgTable, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertsTable = pgTable("alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  price: numeric("price", { precision: 20, scale: 8 }).notNull(),
  condition: text("condition").notNull(), // 'above' | 'below'
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ createdAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
