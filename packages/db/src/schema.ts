import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type MaxionStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "timeout";

export type MaxionStep =
  | "setup"
  | "implement"
  | "lint"
  | "build"
  | "fix"
  | "commit"
  | "pr";

export const maxions = sqliteTable("maxions", {
  id: text("id").primaryKey(),
  task: text("task").notNull(),
  repo: text("repo").notNull().default("Illusion47586/isol8"),
  branch: text("branch").notNull(),
  status: text("status").$type<MaxionStatus>().notNull().default("queued"),
  currentStep: text("current_step").$type<MaxionStep>(),
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const maxionLogs = sqliteTable("maxion_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  maxionId: text("maxion_id")
    .notNull()
    .references(() => maxions.id, { onDelete: "cascade" }),
  step: text("step").$type<MaxionStep>().notNull(),
  stream: text("stream").$type<"stdout" | "stderr" | "system">().notNull(),
  data: text("data").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Maxion = typeof maxions.$inferSelect;
export type NewMaxion = typeof maxions.$inferInsert;
export type MaxionLog = typeof maxionLogs.$inferSelect;
export type NewMaxionLog = typeof maxionLogs.$inferInsert;
