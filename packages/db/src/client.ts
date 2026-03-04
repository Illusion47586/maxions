import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { maxionLogs, maxions } from "./schema.js";

const url = process.env.DATABASE_URL ?? "file:./maxions.db";

const client = createClient({ url });

export const db = drizzle(client, { schema: { maxions, maxionLogs } });

export type Database = typeof db;
