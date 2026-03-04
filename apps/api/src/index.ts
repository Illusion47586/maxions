import { db } from "@maxions/db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { queue } from "./queue.js";
import { githubRouter } from "./routes/github.js";
import { maxionsRouter } from "./routes/maxions.js";
import { slackRouter } from "./routes/slack.js";

// Run DB migrations on startup
await db.run(sql`
  CREATE TABLE IF NOT EXISTS maxions (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    repo TEXT NOT NULL DEFAULT 'Illusion47586/isol8',
    branch TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    current_step TEXT,
    pr_url TEXT,
    pr_number INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    started_at INTEGER,
    completed_at INTEGER
  )
`);

await db.run(sql`
  CREATE TABLE IF NOT EXISTS maxion_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maxion_id TEXT NOT NULL REFERENCES maxions(id) ON DELETE CASCADE,
    step TEXT NOT NULL,
    stream TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )
`);

await db.run(
  sql`CREATE INDEX IF NOT EXISTS idx_maxion_logs_maxion_id ON maxion_logs(maxion_id)`
);
await db.run(
  sql`CREATE INDEX IF NOT EXISTS idx_maxions_status ON maxions(status)`
);

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      process.env.WEB_URL ?? "http://localhost:3002",
      "http://localhost:3000",
      "http://localhost:3002",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    queue: { size: queue.size, pending: queue.pending },
  })
);

app.route("/maxions", maxionsRouter);
app.route("/github", githubRouter);
app.route("/slack", slackRouter);

const port = Number(process.env.API_PORT ?? 3000);
console.log(`Maxions API listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
  // SSE connections are long-lived — disable the default 10s idle timeout
  idleTimeout: 0,
};
