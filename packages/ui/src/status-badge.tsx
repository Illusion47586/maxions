import type { MaxionStatus } from "@maxions/db";

const STATUS_CONFIG: Record<
  MaxionStatus,
  { label: string; className: string }
> = {
  queued: {
    label: "Queued",
    className:
      "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
  running: {
    label: "Running",
    className:
      "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  success: {
    label: "Success",
    className:
      "inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  failed: {
    label: "Failed",
    className:
      "inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  timeout: {
    label: "Timeout",
    className:
      "inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
};

const STATUS_ICONS: Record<MaxionStatus, string> = {
  queued: "○",
  running: "◉",
  success: "✓",
  failed: "✗",
  timeout: "⏱",
};

interface StatusBadgeProps {
  animated?: boolean;
  status: MaxionStatus;
}

export function StatusBadge({ status, animated = true }: StatusBadgeProps) {
  const { label, className } = STATUS_CONFIG[status];
  const icon = STATUS_ICONS[status];

  return (
    <span className={className}>
      <span className={status === "running" && animated ? "animate-pulse" : ""}>
        {icon}
      </span>
      {label}
    </span>
  );
}
