import { Hono } from "hono";

export const slackRouter = new Hono();

// Stub: Slack Events API
// TODO: Trigger maxions from Slack slash commands / mentions
slackRouter.post("/events", async (c) => {
  const body = await c.req.json<{ type?: string; challenge?: string }>();

  // Respond to Slack URL verification challenge
  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  console.log("[slack] event received:", body.type);
  return c.json({ ok: true });
});
