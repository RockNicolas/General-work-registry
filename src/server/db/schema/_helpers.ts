import { timestamp } from "drizzle-orm/pg-core";

/** Instantes sempre com fuso (timestamptz); datas de negócio usam `date` como string ISO. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
