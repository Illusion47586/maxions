import type { MaxionStep } from "@maxions/db";

const STEPS: Array<{ key: MaxionStep; label: string }> = [
  { key: "setup", label: "Setup" },
  { key: "implement", label: "Implement" },
  { key: "lint", label: "Lint" },
  { key: "build", label: "Build" },
  { key: "fix", label: "Fix" },
  { key: "commit", label: "Commit" },
  { key: "pr", label: "Open PR" },
];

type StepState = "pending" | "running" | "done" | "error";

interface StepTimelineProps {
  currentStep?: MaxionStep | null;
  failedStep?: MaxionStep | null;
  status: "queued" | "running" | "success" | "failed" | "timeout";
}

function getStepState(
  step: MaxionStep,
  currentStep: MaxionStep | null | undefined,
  status: StepTimelineProps["status"],
  failedStep?: MaxionStep | null
): StepState {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  if (status === "queued") {
    return "pending";
  }

  if (failedStep === step) {
    return "error";
  }

  if (currentIndex === -1) {
    // Job finished
    if (status === "success") {
      return "done";
    }
    return "pending";
  }

  if (stepIndex < currentIndex) {
    return "done";
  }
  if (stepIndex === currentIndex) {
    if (status === "failed" || status === "timeout") {
      return "error";
    }
    return "running";
  }
  return "pending";
}

const STATE_STYLES: Record<StepState, string> = {
  pending: "bg-slate-700 text-slate-400 border-slate-600",
  running: "bg-blue-600 text-white border-blue-500 animate-pulse",
  done: "bg-green-600 text-white border-green-500",
  error: "bg-red-600 text-white border-red-500",
};

const CONNECTOR_STYLES: Record<StepState, string> = {
  pending: "bg-slate-700",
  running: "bg-blue-500",
  done: "bg-green-500",
  error: "bg-red-500",
};

function getStepIcon(state: StepState, index: number): string {
  if (state === "done") {
    return "✓";
  }
  if (state === "error") {
    return "✗";
  }
  if (state === "running") {
    return "◉";
  }
  return String(index + 1);
}

function getStepLabelClass(state: StepState): string {
  if (state === "running") {
    return "font-medium text-blue-400";
  }
  if (state === "done") {
    return "text-green-400";
  }
  if (state === "error") {
    return "text-red-400";
  }
  return "text-slate-500";
}

export function StepTimeline({
  currentStep,
  status,
  failedStep,
}: StepTimelineProps) {
  return (
    <div className="flex w-full items-center gap-0 overflow-x-auto py-2">
      {STEPS.map((step, i) => {
        const state = getStepState(step.key, currentStep, status, failedStep);
        const isLast = i === STEPS.length - 1;

        return (
          <div className="flex min-w-0 items-center" key={step.key}>
            {/* Step circle + label */}
            <div className="flex shrink-0 flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 font-bold text-xs transition-all ${STATE_STYLES[state]}`}
              >
                {getStepIcon(state, i)}
              </div>
              <span
                className={`whitespace-nowrap text-[10px] transition-colors ${getStepLabelClass(state)}`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className={`mx-1 mt-[-14px] h-0.5 min-w-[16px] flex-1 transition-colors ${
                  CONNECTOR_STYLES[
                    getStepState(
                      STEPS[i + 1].key,
                      currentStep,
                      status,
                      failedStep
                    )
                  ]
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
