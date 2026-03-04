import { randomUUID } from "node:crypto";
import { db, maxionLogs, maxions } from "@maxions/db";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { enqueueMaxion, killMaxion } from "../queue.js";
import { sseBus } from "../sse.js";

export const maxionsRouter = new Hono();

// POST /maxions — create a new job
maxionsRouter.post("/", async (c) => {
  const body = await c.req.json<{ task: string; repo?: string }>();

  if (!body.task?.trim()) {
    return c.json({ error: "task is required" }, 400);
  }

  const id = randomUUID();
  const repo = body.repo ?? process.env.TARGET_REPO ?? "Illusion47586/isol8";
  const branch = `maxion/${id.slice(0, 8)}`;

  await db.insert(maxions).values({ id, task: body.task.trim(), repo, branch });

  enqueueMaxion(id);

  const job = await db.query.maxions.findFirst({ where: eq(maxions.id, id) });
  return c.json(job, 201);
});

// GET /maxions — list all jobs (newest first)
maxionsRouter.get("/", async (c) => {
  const rows = await db.query.maxions.findMany({
    orderBy: [desc(maxions.createdAt)],
  });
  return c.json(rows);
});

// GET /maxions/:id — single job
maxionsRouter.get("/:id", async (c) => {
  const job = await db.query.maxions.findFirst({
    where: eq(maxions.id, c.req.param("id")),
  });
  if (!job) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(job);
});

// POST /maxions/:id/kill — kill a queued or running maxion
maxionsRouter.post("/:id/kill", async (c) => {
  const id = c.req.param("id");
  const job = await db.query.maxions.findFirst({
    where: eq(maxions.id, id),
  });
  if (!job) {
    return c.json({ error: "not found" }, 404);
  }
  if (job.status !== "running" && job.status !== "queued") {
    return c.json({ error: "maxion is not running or queued" }, 409);
  }
  const killed = killMaxion(id);
  if (!killed) {
    // Already finished between the DB read and here
    return c.json({ error: "maxion is not running or queued" }, 409);
  }
  return c.json({ ok: true });
});

// DELETE /maxions/:id — remove a job and its logs
maxionsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const job = await db.query.maxions.findFirst({
    where: eq(maxions.id, id),
  });
  if (!job) {
    return c.json({ error: "not found" }, 404);
  }
  // Refuse to delete a running job
  if (job.status === "running" || job.status === "queued") {
    return c.json({ error: "cannot delete a running or queued maxion" }, 409);
  }
  await db.delete(maxionLogs).where(eq(maxionLogs.maxionId, id));
  await db.delete(maxions).where(eq(maxions.id, id));
  return c.json({ ok: true });
});

// GET /maxions/:id/logs — full log history
maxionsRouter.get("/:id/logs", async (c) => {
  const id = c.req.param("id");
  const logs = await db.query.maxionLogs.findMany({
    where: eq(maxionLogs.maxionId, id),
    orderBy: [maxionLogs.id],
  });
  return c.json(logs);
});

// GET /maxions/:id/stream — SSE live feed
maxionsRouter.get("/:id/stream", (c) => {
  const maxionId = c.req.param("id");

  return new Response(
    new ReadableStream({
      start(controller) {
        const send = (msg: object) => {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(msg)}\n\n`)
          );
        };

        // Send a heartbeat comment every 15 seconds to keep the connection alive
        const heartbeat = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
        }, 15_000);

        const listener = (message: object) => {
          send(message);
        };

        sseBus.on(`maxion:${maxionId}`, listener);

        // Clean up when client disconnects
        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          sseBus.off(`maxion:${maxionId}`, listener);
          controller.close();
        });
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }
  );
});
