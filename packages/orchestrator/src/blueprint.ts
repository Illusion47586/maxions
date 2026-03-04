import { DockerIsol8 } from "@isol8/core";
import type { MaxionStep } from "@maxions/db";
import { createAppAuth } from "@octokit/auth-app";
import type {
  MaxionJob,
  OrchestratorCallbacks,
  OrchestratorConfig,
} from "./types.js";

const PI_MODEL = "github-copilot/gpt-5-mini";
const PR_URL_REGEX = /https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/;

// ─────────────────────────────────────────────────────────────────────────────
// GitHub App — mint a short-lived installation access token
// ─────────────────────────────────────────────────────────────────────────────

async function getInstallationToken(
  appId: number,
  privateKey: string,
  installationId: number
): Promise<string> {
  const auth = createAppAuth({ appId, privateKey, installationId });
  const { token } = await auth({ type: "installation" });
  return token;
}

// ─────────────────────────────────────────────────────────────────────────────
// setupScript — clones repo + checks out branch before pi receives any prompt
// ─────────────────────────────────────────────────────────────────────────────

function buildSetupScript(job: MaxionJob): string {
  const { repo, branch } = job;
  return `
set -e
echo "bun $(bun --version)"
echo "$(git --version)"
git config --global user.email "maxion@maxions.local"
git config --global user.name "Maxion Bot"
cd /sandbox
rm -rf repo
git clone https://x-access-token:$GITHUB_TOKEN@github.com/${repo}.git repo 2>&1
cd repo
git checkout -b ${branch} || git checkout ${branch}
bun i --no-cache
echo "ready — branch ${branch}"`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream consumer — setImmediate-based to avoid Bun event loop deadlock.
// `for await` / `await iter.next()` blocks the Bun event loop and prevents
// Docker TCP stream `data` events from firing. Using .then() + setImmediate
// keeps the loop free between iterations.
// ─────────────────────────────────────────────────────────────────────────────

interface StreamEvent {
  data: string;
  type: string;
}

interface ConsumeResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

function consumeStream(
  stream: AsyncIterable<StreamEvent>,
  onEvent?: (ev: StreamEvent) => void
): Promise<ConsumeResult> {
  return new Promise<ConsumeResult>((resolve, reject) => {
    const result: ConsumeResult = { exitCode: 0, stdout: "", stderr: "" };
    const iter = stream[Symbol.asyncIterator]();

    function drainNext() {
      iter
        .next()
        .then(({ value: ev, done }) => {
          if (done) {
            resolve(result);
            return;
          }
          process.stderr.write(`[isol8] ${JSON.stringify(ev)}\n`);
          if (ev.type === "stdout") {
            result.stdout += ev.data;
            onEvent?.(ev);
          } else if (ev.type === "stderr") {
            result.stderr += ev.data;
            onEvent?.(ev);
          } else if (ev.type === "exit") {
            result.exitCode = Number.parseInt(ev.data, 10);
          }
          setImmediate(drainNext);
        })
        .catch(reject);
    }

    setImmediate(drainNext);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step runner
// ─────────────────────────────────────────────────────────────────────────────

async function runStep(
  engine: DockerIsol8,
  step: MaxionStep,
  maxionId: string,
  callbacks: OrchestratorCallbacks,
  request: Parameters<DockerIsol8["executeStream"]>[0]
): Promise<ConsumeResult> {
  callbacks.onStepStart({ maxionId, step });
  const stream = engine.executeStream(request);

  // Stream each chunk to the log callback immediately as it arrives
  const result = await consumeStream(stream, (ev) => {
    callbacks.onLog({
      maxionId,
      step,
      stream: ev.type as "stdout" | "stderr",
      data: ev.data,
    });
  });

  callbacks.onStepEnd({ maxionId, step, exitCode: result.exitCode });

  // Lint and build are allowed to fail — the fix loop handles them.
  // Every other step failing is a hard error: throw so the maxion is
  // immediately marked failed instead of hanging or silently continuing.
  const allowedToFail: MaxionStep[] = ["lint", "build"];
  if (!allowedToFail.includes(step) && result.exitCode !== 0) {
    const combined = result.stdout + result.stderr;
    throw new Error(
      `Step "${step}" failed (exit ${result.exitCode}):\n${combined.slice(-2000)}`
    );
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix loop — agent fixes errors, re-checks lint + build, up to maxFixRounds
// ─────────────────────────────────────────────────────────────────────────────

async function runFixLoop(
  engine: DockerIsol8,
  maxionId: string,
  callbacks: OrchestratorCallbacks,
  initialLint: ConsumeResult,
  initialBuild: ConsumeResult,
  maxFixRounds: number
): Promise<void> {
  let lintOk = initialLint.exitCode === 0;
  let buildOk = initialBuild.exitCode === 0;
  let lintOut = initialLint.stdout + initialLint.stderr;
  let buildOut = initialBuild.stdout + initialBuild.stderr;

  for (let round = 1; round <= maxFixRounds; round++) {
    const errors: string[] = [];
    if (!lintOk) {
      errors.push(`Lint errors:\n${lintOut}`);
    }
    if (!buildOk) {
      errors.push(`Build errors:\n${buildOut}`);
    }

    await runStep(engine, "fix", maxionId, callbacks, {
      runtime: "agent",
      code: `You are working in /sandbox/repo. Fix all of the following errors. Do NOT commit anything.\n\n${errors.join("\n\n")}`,
      agentFlags: `--model ${PI_MODEL} --no-session`,
      timeoutMs: 900_000,
      workdir: "/sandbox/repo",
    });

    const relint = await runStep(engine, "lint", maxionId, callbacks, {
      runtime: "agent",
      cmd: `export PATH="$HOME/.bun/bin:$PATH" && cd /sandbox/repo && bun run lint:check 2>&1`,
      timeoutMs: 120_000,
      workdir: "/sandbox/repo",
    });

    const rebuild = await runStep(engine, "build", maxionId, callbacks, {
      runtime: "agent",
      cmd: `export PATH="$HOME/.bun/bin:$PATH" && cd /sandbox/repo && bun run build 2>&1`,
      timeoutMs: 300_000,
      workdir: "/sandbox/repo",
    });

    lintOk = relint.exitCode === 0;
    buildOk = rebuild.exitCode === 0;
    lintOut = relint.stdout + relint.stderr;
    buildOut = rebuild.stdout + rebuild.stderr;

    if (lintOk && buildOk) {
      return;
    }

    if (round === maxFixRounds) {
      throw new Error(
        `Lint/build still failing after ${maxFixRounds} fix rounds`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function runMaxion(
  job: MaxionJob,
  config: OrchestratorConfig,
  callbacks: OrchestratorCallbacks
): Promise<void> {
  const { id: maxionId, repo, branch, task } = job;
  const {
    appId,
    privateKey,
    installationId,
    copilotToken,
    maxFixRounds = 2,
    signal,
  } = config;

  // Mint a fresh installation access token before starting the container.
  // Tokens are valid for 1 hour — plenty for any single maxion run.
  const appToken = await getInstallationToken(
    appId,
    privateKey,
    installationId
  );

  const engine = new DockerIsol8({
    mode: "persistent",
    network: "host",
    timeoutMs: 1_800_000,
    memoryLimit: "4g",
    cpuLimit: 2,
    pidsLimit: 200,
    sandboxSize: "4g",
    maxOutputSize: 10 * 1024 * 1024,
    // GITHUB_TOKEN = App installation token — gh CLI and git use it automatically
    // COPILOT_GITHUB_TOKEN = Copilot PAT — pi checks this first, before GITHUB_TOKEN
    secrets: { GITHUB_TOKEN: appToken, COPILOT_GITHUB_TOKEN: copilotToken },
    image: "isol8:agent",
  });

  await engine.start();

  // Abort handler — stop the container immediately when the signal fires
  const onAbort = () => {
    engine.stop().catch((_err: unknown) => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    // ── Setup ──────────────────────────────────────────────────────────────
    // setupScript clones the repo + checks out the branch before any execution.
    await runStep(engine, "setup", maxionId, callbacks, {
      runtime: "agent",
      setupScript: buildSetupScript(job),
      cmd: 'echo "[setup] done"',
      timeoutMs: 300_000,
      workdir: "/sandbox/repo",
    });

    // ── Implement ──────────────────────────────────────────────────────────
    await runStep(engine, "implement", maxionId, callbacks, {
      runtime: "agent",
      code: `You are working in /sandbox/repo on branch \`${branch}\` of ${repo}.

Implement the following task — read the repo structure first, make all necessary code changes, run \`bun install\` if node_modules is missing. Do NOT commit anything.

Task:
${task}`,
      agentFlags: `--model ${PI_MODEL} --no-session`,
      timeoutMs: 1_200_000,
      workdir: "/sandbox/repo",
    });

    // ── Lint ───────────────────────────────────────────────────────────────
    const lintResult = await runStep(engine, "lint", maxionId, callbacks, {
      runtime: "agent",
      cmd: "bun run lint:check 2>&1",
      timeoutMs: 120_000,
      workdir: "/sandbox/repo",
    });

    // ── Build ──────────────────────────────────────────────────────────────
    const buildResult = await runStep(engine, "build", maxionId, callbacks, {
      runtime: "agent",
      cmd: "bun run build 2>&1",
      timeoutMs: 300_000,
      workdir: "/sandbox/repo",
    });

    // ── Fix (if needed) ────────────────────────────────────────────────────
    if (lintResult.exitCode !== 0 || buildResult.exitCode !== 0) {
      await runFixLoop(
        engine,
        maxionId,
        callbacks,
        lintResult,
        buildResult,
        maxFixRounds
      );
    }

    // ── Commit & Push ──────────────────────────────────────────────────────
    await runStep(engine, "commit", maxionId, callbacks, {
      runtime: "agent",
      code: `You are in /sandbox/repo. Stage and commit all changes, then push to origin.

Write a conventional commit message (feat/fix/chore etc.) that summarises the changes. The header must be ≤ 100 characters. Append this exact trailer after a blank line:

Implemented by Maxion (pi + GitHub Copilot)
Maxion ID: ${maxionId}

Write the full commit message (subject line + blank line + trailers) to /tmp/commit-msg.txt, then run:
git add -A && git commit -F /tmp/commit-msg.txt && git push -u origin ${branch}`,
      agentFlags: `--model ${PI_MODEL} --no-session`,
      timeoutMs: 120_000,
      workdir: "/sandbox/repo",
    });

    // ── Pull Request ───────────────────────────────────────────────────────
    // The agent generates a proper PR title + description, then appends
    // maxion metadata. The result is saved to /tmp/pr-body.md and passed
    // to gh via --body-file to avoid any shell escaping issues.
    const prResult = await runStep(engine, "pr", maxionId, callbacks, {
      runtime: "agent",
      code: `You are in /sandbox/repo. A pull request needs to be opened for the work just completed.

The original task was:
${task}

Do the following:
1. Run \`git log --oneline -10\` and \`git diff main...HEAD --stat\` to understand what was changed.
2. Write a PR title (one line, no quotes) and a markdown PR body that summarises the changes clearly. The body must end with this exact metadata block — fill in the values:

---

*Created by Maxions — AI coding agent platform.*

- **Maxion ID**: ${maxionId}
- **Model**: ${PI_MODEL}
- **Branch**: ${branch}

3. Save the title to /tmp/pr-title.txt and the body to /tmp/pr-body.md.
4. Run: gh pr create --title "$(cat /tmp/pr-title.txt)" --body-file /tmp/pr-body.md --base main --head ${branch}
5. Output the resulting PR URL on its own line.`,
      agentFlags: `--model ${PI_MODEL} --no-session`,
      timeoutMs: 300_000,
      workdir: "/sandbox/repo",
    });

    // Extract PR URL from output
    const prMatch = (prResult.stdout + prResult.stderr).match(PR_URL_REGEX);
    if (prMatch) {
      await callbacks.onPR(
        maxionId,
        prMatch[0],
        Number.parseInt(prMatch[1], 10)
      );
    }
  } catch (error) {
    await callbacks.onError(
      maxionId,
      error instanceof Error ? error : new Error(String(error))
    );
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await engine.stop();
  }
}
