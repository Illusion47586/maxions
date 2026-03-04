import { Hono } from "hono";

export const githubRouter = new Hono();

// Stub: GitHub App webhook
// TODO: Trigger maxions from GitHub issue/PR comments
githubRouter.post("/webhook", async (c) => {
  const event = c.req.header("X-GitHub-Event");
  const body = await c.req.json();
  console.log(
    `[github] webhook event: ${event}`,
    JSON.stringify(body).slice(0, 200)
  );
  return c.json({ ok: true, received: event });
});
