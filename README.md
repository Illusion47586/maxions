# Maxions

Unattended, one-shot AI coding agents. Give Maxions a task and a target repo — it clones, implements, lints, builds, fixes errors, commits, pushes, and opens a pull request with no human in the loop.

Inspired by [Stripe's Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents), where over 1,300 PRs merge autonomously every week. Built on top of [isol8](https://github.com/Illusion47586/isol8) — an isolated code execution platform for AI agents.

## Demo

**Maxionalisa** ([`@maxionalisa`](https://github.com/apps/maxionalisa)) is a GitHub App powered by this platform. Here it is opening a real pull request autonomously on the isol8 repo:

> [Illusion47586/isol8#111](https://github.com/Illusion47586/isol8/pull/111) — cloned the repo, made the change, committed with a conventional commit message, and opened the PR. No human code.

---

## What

Maxions is a self-hosted platform for running one-shot coding agents as a queue of jobs. You submit a plain-English task and a target GitHub repo. The platform:

1. Spins up a fresh, isolated Docker container for the job
2. Clones the repo and checks out a new branch
3. Runs the [`pi`](https://github.com/mariozechner/pi) coding agent (GitHub Copilot) to implement the task
4. Runs lint and build checks deterministically
5. If they fail, runs the agent again to fix the errors (up to 2 rounds)
6. Commits with a conventional commit message and pushes
7. Opens a pull request via the `gh` CLI
8. Streams every log line to the web dashboard in real time

The result is a PR ready for human review.

## Why

One-shot coding agents need three things to be reliable:

1. **An isolated environment** — each run must not affect other runs or the host system, and must start from a clean state every time.
2. **A deterministic blueprint** — the agent should only do the parts that require judgment (write code, fix errors). Linting, building, committing, and opening PRs are deterministic and should not be left to the agent's discretion.
3. **Bounded retries** — lint/build failures are expected on first attempt. A fix loop with a hard cap (2 rounds) handles them without infinite token burn.

isol8 solves #1. Maxions implements #2 and #3 on top of it.

## How

Each job runs inside a single persistent `DockerIsol8` container. All pipeline steps share the same container filesystem, so the repo cloned in setup is still there for implement, lint, fix, and commit.

```
Task
  │
  ▼
[setup]      clone repo, checkout branch, install deps
             (bash, inside container, before agent starts)
  │
  ▼
[implement]  pi agent reads the repo and writes the code
             (runtime: "agent", code = task prompt)
  │
  ▼
[lint]       bun run lint:check        ─┐
[build]      bun run build             ─┤ allowed to fail
  │                                    ─┘
  ▼ (if either failed)
[fix]        pi agent fixes lint/build errors
             re-runs lint + build, up to 2 rounds
  │
  ▼
[commit]     pi writes commit message → /tmp/commit-msg.txt
             git add -A && git commit -F /tmp/commit-msg.txt && git push
  │
  ▼
[pr]         pi writes title + body → /tmp/pr-title.txt, /tmp/pr-body.md
             gh pr create --body-file /tmp/pr-body.md
```

For a full walkthrough of this architecture, see the isol8 guide: [**One-shot coding agents**](https://isol8.notdhruv.com/guides/one-shot-coding-agents).

### isol8 — the sandbox layer

[isol8](https://github.com/Illusion47586/isol8) is the execution engine that provides:

- **Isolated Docker containers** — read-only root filesystem, non-root `sandbox` user, seccomp syscall filtering
- **Persistent sessions** — a single container reused across all steps, with shared `/sandbox` filesystem
- **The `agent` runtime** — runs `pi` inside the container; the `code` field is the LLM prompt
- **Secret masking** — credentials in `secrets` are automatically redacted from all output
- **`setupScript`** — bash that runs inside the container before the agent receives any prompt

Maxions uses `DockerIsol8` in `mode: "persistent"` with `network: "host"` and the `isol8:agent` image (which has `pi`, `gh`, `git`, and `bun` pre-installed).

### The two-token split

The container receives two separate GitHub tokens:

| Variable | Token type | Used by |
|---|---|---|
| `GITHUB_TOKEN` | GitHub App installation token (short-lived, repo-scoped) | `git clone`, `git push`, `gh` CLI |
| `COPILOT_GITHUB_TOKEN` | Personal Access Token with Copilot access | `pi` (checks this env var before `GITHUB_TOKEN`) |

GitHub App installation tokens are rejected by the Copilot LLM API — they are server-to-server tokens, not user tokens. A PAT is required for Copilot. The split keeps both integrations working.

A fresh installation token is minted per run (via `@octokit/auth-app`) — tokens expire in 1 hour, so they must not be cached across jobs.

---

## Stack

| Layer | Tech |
|---|---|
| Monorepo | Turborepo + Bun |
| API server | Hono (Bun) |
| Web dashboard | Next.js 15 + shadcn/ui + Tailwind CSS |
| Database | SQLite + Drizzle ORM |
| Agent sandbox | [`@isol8/core`](https://github.com/Illusion47586/isol8) — `DockerIsol8` persistent mode |
| Coding agent | `pi` (`@mariozechner/pi-coding-agent`) via `runtime: "agent"` |
| LLM | GitHub Copilot (`github-copilot/gpt-5-mini`) |
| GitHub auth | GitHub App — installation tokens via `@octokit/auth-app` |
| Queue | `p-queue` (concurrency: 3) |
| Linting | Ultracite (Biome-based) |

## Project structure

```
apps/
  api/          Hono API — job queue, SSE live streaming, REST routes
  web/          Next.js dashboard — job list, detail view, live log terminal
packages/
  orchestrator/ The blueprint: all pipeline steps, DockerIsol8 engine wiring
  db/           Drizzle schema, client, SQLite migrations
  ui/           Shared React components — StatusBadge, LogTerminal, StepTimeline
```

---

## Prerequisites

- [Bun](https://bun.sh) 1.2+
- Docker running locally, with access to `/var/run/docker.sock`
- The `isol8:agent` image (pre-built from `@isol8/core`):
  ```bash
  docker build --target agent -t isol8:agent node_modules/@isol8/core/docker/
  ```
- A [GitHub App](https://docs.github.com/en/apps/creating-github-apps) installed on the target repo with **Contents** (read/write) and **Pull Requests** (read/write) permissions
- A GitHub PAT with Copilot access (for the `pi` agent)

## Setup

```bash
bun install
cp .env.example .env
# Fill in .env — see below
bun run db:migrate
bun run dev
```

- Dashboard: http://localhost:3002
- API: http://localhost:3000

## Environment variables

```env
# GitHub App — mints short-lived installation tokens for git + gh CLI
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=        # PEM, with literal \n between lines
GITHUB_APP_INSTALLATION_ID=

# GitHub PAT with Copilot access — pi uses this for the Copilot LLM API
COPILOT_GITHUB_TOKEN=

# SQLite database path
DATABASE_URL=file:./maxions.db

# Server ports
API_PORT=3000
WEB_PORT=3002

# Default target repo (overridable per-task via the API)
TARGET_REPO=owner/repo
```

## Docker Compose

```bash
docker compose up --build
```

The API container mounts `/var/run/docker.sock` to spawn sandbox containers as siblings on the host Docker daemon (Docker-outside-of-Docker). The `isol8:agent` image must be built on the host before starting.

---

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/maxions` | Create and enqueue a new job |
| `GET` | `/maxions` | List all jobs (newest first) |
| `GET` | `/maxions/:id` | Get a single job |
| `POST` | `/maxions/:id/kill` | Kill a queued or running job |
| `DELETE` | `/maxions/:id` | Delete a completed job and its logs |
| `GET` | `/maxions/:id/logs` | Full log history |
| `GET` | `/maxions/:id/stream` | SSE live event stream |

**Create a job:**
```bash
curl -X POST http://localhost:3000/maxions \
  -H "Content-Type: application/json" \
  -d '{"task": "Add a dark mode toggle to the settings page", "repo": "owner/repo"}'
```

---

## Implementation notes

A few non-obvious things discovered while building this:

- **`for await` deadlocks Bun** when consuming Docker TCP streams. The stream consumer in `packages/orchestrator/src/blueprint.ts` uses `.then()` + `setImmediate` chaining instead of `for await` or `await iter.next()` — this keeps the Bun event loop free between iterations so Docker TCP `data` events can fire.
- **`git commit` without `-m` opens an interactive editor** and hangs in a non-interactive container. The commit step instructs the agent to write the message to `/tmp/commit-msg.txt` and run `git commit -F /tmp/commit-msg.txt`.
- **`gh pr create --body "..."` breaks** when the body contains backticks or `$(...)` — they are interpreted as shell command substitution. The PR body is written to `/tmp/pr-body.md` and passed via `--body-file`.
- **Bun SSE connections drop after 10 seconds** without `idleTimeout: 0` on the Bun server export — Bun's default idle timeout kills long-lived connections before the SSE heartbeat runs.
- **`X-Accel-Buffering: no`** is required on SSE responses when behind nginx — without it, nginx buffers the entire response body and the client sees nothing until the connection closes.
- **`git checkout -b` fails on retry** with `set -e` active if the branch already exists. The `|| git checkout ${branch}` fallback in the setup script is load-bearing.

## Further reading

- [isol8 — One-shot coding agents guide](https://isol8.notdhruv.com/guides/one-shot-coding-agents) — the architectural patterns this project is built on
- [Stripe's Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) — the original inspiration
- [isol8 repo](https://github.com/Illusion47586/isol8) — the sandbox engine
