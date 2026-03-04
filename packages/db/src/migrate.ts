import { sql } from "drizzle-orm";
import { db } from "./client.js";

async function migrate() {
  console.log("Running migrations...");

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

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_maxion_logs_maxion_id ON maxion_logs(maxion_id)
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_maxions_status ON maxions(status)
  `);

  console.log("Migrations complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
