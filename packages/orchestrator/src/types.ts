import type { MaxionStep } from "@maxions/db";

export interface MaxionJob {
  branch: string;
  id: string;
  repo: string;
  task: string;
}

export interface LogEvent {
  data: string;
  maxionId: string;
  step: MaxionStep;
  stream: "stdout" | "stderr" | "system";
}

export interface StepEvent {
  maxionId: string;
  step: MaxionStep;
}

export interface OrchestratorCallbacks {
  onError: (maxionId: string, error: Error) => void | Promise<void>;
  onLog: (event: LogEvent) => void | Promise<void>;
  onPR: (
    maxionId: string,
    prUrl: string,
    prNumber: number
  ) => void | Promise<void>;
  onStepEnd: (event: StepEvent & { exitCode: number }) => void | Promise<void>;
  onStepStart: (event: StepEvent) => void | Promise<void>;
}

export interface OrchestratorConfig {
  /** GitHub App ID */
  appId: number;
  /** GitHub PAT with Copilot access — passed into the container as GITHUB_TOKEN for pi */
  copilotToken: string;
  /** GitHub App installation ID for the target org/repo */
  installationId: number;
  maxFixRounds?: number;
  /** GitHub App private key (PEM string) */
  privateKey: string;
  /** AbortSignal — abort to kill the running container immediately. */
  signal?: AbortSignal;
  targetRepo: string;
}
