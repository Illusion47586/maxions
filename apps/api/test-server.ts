import { DockerIsol8 } from "@isol8/core";
import { Hono } from "hono";

const app = new Hono();

app.get("/test", async (c) => {
  const engine = new DockerIsol8({
    mode: "ephemeral",
    network: "filtered",
    networkFilter: {
      whitelist: ["github\\.com"],
      blacklist: [],
    },
    timeoutMs: 60_000,
    image: "isol8:agent",
  });

  const stream = engine.executeStream({
    runtime: "bash",
    code: "echo hello; sleep 3; echo world",
    timeoutMs: 60_000,
  });

  const results: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const iter = stream[Symbol.asyncIterator]();
    let count = 0;

    const heartbeat = setInterval(() => {
      console.log(`heartbeat — waiting for event ${count + 1}...`);
    }, 2000);

    function drainNext() {
      iter
        .next()
        .then(({ value, done }) => {
          if (done) {
            clearInterval(heartbeat);
            console.log("DONE after", count, "events");
            resolve();
            return;
          }
          count++;
          const ev = value as { type: string; data: string };
          const msg = `EVENT ${count}: ${ev.type} = ${JSON.stringify(ev.data.slice(0, 80))}`;
          console.log(msg);
          results.push(msg);
          setImmediate(drainNext);
        })
        .catch((err: Error) => {
          clearInterval(heartbeat);
          reject(err);
        });
    }

    setImmediate(drainNext);
  });

  return c.json({ events: results });
});

console.log("Test server starting on port 4567...");

export default {
  port: 4567,
  fetch: app.fetch,
};
