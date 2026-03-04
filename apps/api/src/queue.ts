import { db, maxionLogs, maxions } from "@maxions/db";
import type { OrchestratorConfig } from "@maxions/orchestrator";
import { runMaxion } from "@maxions/orchestrator";
import { eq } from "drizzle-orm";
import PQueue from "p-queue";
import { sseBus } from "./sse.js";

const queue: PQueue = new PQueue({ concurrency: 3 });

// AbortControllers for in-flight and queued maxions
const controllers = new Map<string, AbortController>();

function getConfig(signal: AbortSignal): OrchestratorConfig {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  const copilotToken = process.env.COPILOT_GITHUB_TOKEN;
  const targetRepo = process.env.TARGET_REPO ?? "Illusion47586/isol8";

  if (!(appId && privateKey && installationId)) {
    throw new Error(
      "GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID env vars are required"
    );
  }
  if (!copilotToken) {
    throw new Error("COPILOT_GITHUB_TOKEN env var is required");
  }

  return {
    appId: Number(appId),
    privateKey,
    installationId: Number(installationId),
    copilotToken,
    targetRepo,
    signal,
  };
}

export function enqueueMaxion(maxionId: string): void {
  const controller = new AbortController();
  controllers.set(maxionId, controller);

  queue
    .add(
      async () => {
        // If already aborted while queued, mark cancelled and bail
        if (controller.signal.aborted) {
          controllers.delete(maxionId);
          await db
            .update(maxions)
            .set({
              status: "failed",
              errorMessage: "Killed by user",
              completedAt: new Date(),
            })
            .where(eq(maxions.id, maxionId));
          sseBus.publish(maxionId, {
            maxionId,
            type: "status",
            data: { status: "failed", error: "Killed by user" },
          });
          return;
        }

        await db
          .update(maxions)
          .set({ status: "running", startedAt: new Date() })
          .where(eq(maxions.id, maxionId));

        sseBus.publish(maxionId, {
          maxionId,
          type: "status",
          data: { status: "running" },
        });

        const job = await db.query.maxions.findFirst({
          where: eq(maxions.id, maxionId),
        });

        if (!job) {
          throw new Error(`Maxion ${maxionId} not found`);
        }

        await runMaxion(
          { id: job.id, task: job.task, repo: job.repo, branch: job.branch },
          getConfig(controller.signal),
          {
            onLog: async (event) => {
              await db.insert(maxionLogs).values({
                maxionId: event.maxionId,
                step: event.step,
                stream: event.stream,
                data: event.data,
              });
              sseBus.publish(event.maxionId, {
                maxionId: event.maxionId,
                type: "log",
                data: {
                  step: event.step,
                  stream: event.stream,
                  data: event.data,
                },
              });
            },

            onStepStart: async (event) => {
              await db
                .update(maxions)
                .set({ currentStep: event.step })
                .where(eq(maxions.id, event.maxionId));

              sseBus.publish(event.maxionId, {
                maxionId: event.maxionId,
                type: "step",
                data: { step: event.step, state: "running" },
              });
            },

            onStepEnd: (event) => {
              sseBus.publish(event.maxionId, {
                maxionId: event.maxionId,
                type: "step",
                data: {
                  step: event.step,
                  state: event.exitCode === 0 ? "done" : "error",
                  exitCode: event.exitCode,
                },
              });
            },

            onPR: async (id, prUrl, prNumber) => {
              await db
                .update(maxions)
                .set({ prUrl, prNumber })
                .where(eq(maxions.id, id));

              sseBus.publish(id, {
                maxionId: id,
                type: "pr",
                data: { prUrl, prNumber },
              });
            },

            onError: async (id, error) => {
              await db
                .update(maxions)
                .set({
                  status: "failed",
                  errorMessage: error.message,
                  completedAt: new Date(),
                })
                .where(eq(maxions.id, id));

              sseBus.publish(id, {
                maxionId: id,
                type: "status",
                data: { status: "failed", error: error.message },
              });
            },
          }
        );

        // If we got here without onError being called, mark success
        const current = await db.query.maxions.findFirst({
          where: eq(maxions.id, maxionId),
        });
        if (current?.status === "running") {
          await db
            .update(maxions)
            .set({ status: "success", completedAt: new Date() })
            .where(eq(maxions.id, maxionId));

          sseBus.publish(maxionId, {
            maxionId,
            type: "status",
            data: { status: "success" },
          });
        }
      },
      { signal: controller.signal }
    )
    .finally(() => {
      controllers.delete(maxionId);
    });
}

/**
 * Kill a queued or running maxion.
 * Returns false if the maxion is not currently tracked (already done/not found).
 */
export function killMaxion(maxionId: string): boolean {
  const controller = controllers.get(maxionId);
  if (!controller) {
    return false;
  }
  controller.abort();
  return true;
}

export { queue };
