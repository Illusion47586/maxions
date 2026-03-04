import { useEffect, useRef } from "react";

export interface LogLine {
  createdAt: number;
  data: string;
  id: number;
  step: string;
  stream: "stdout" | "stderr" | "system";
}

const STREAM_COLORS: Record<LogLine["stream"], string> = {
  stdout: "text-slate-200",
  stderr: "text-red-400",
  system: "text-blue-400",
};

const STEP_COLORS: Record<string, string> = {
  setup: "text-violet-400",
  implement: "text-yellow-400",
  lint: "text-cyan-400",
  build: "text-cyan-400",
  fix: "text-orange-400",
  commit: "text-green-400",
  pr: "text-green-400",
};

interface LogTerminalProps {
  className?: string;
  isRunning?: boolean;
  lines: LogLine[];
}

export function LogTerminal({
  lines,
  isRunning = false,
  className = "",
}: LogTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (lines.length !== prevLengthRef.current) {
      prevLengthRef.current = lines.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-slate-700 bg-[#0d1117] font-mono text-xs ${className}`}
    >
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-slate-700 border-b bg-slate-800 px-4 py-2">
        <span className="h-3 w-3 rounded-full bg-red-500" />
        <span className="h-3 w-3 rounded-full bg-yellow-500" />
        <span className="h-3 w-3 rounded-full bg-green-500" />
        <span className="ml-2 text-slate-400 text-xs">maxion logs</span>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1.5 text-blue-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            live
          </span>
        )}
      </div>

      {/* Log lines */}
      <div className="max-h-[600px] space-y-0.5 overflow-y-auto p-4">
        {lines.length === 0 ? (
          <div className="text-slate-600 italic">Waiting for logs...</div>
        ) : (
          lines.map((line) => (
            <div className="flex gap-3 leading-5" key={line.id}>
              <span
                className={`shrink-0 ${STEP_COLORS[line.step] ?? "text-slate-500"}`}
              >
                [{line.step}]
              </span>
              <span
                className={`whitespace-pre-wrap break-all ${STREAM_COLORS[line.stream]}`}
              >
                {line.data}
              </span>
            </div>
          ))
        )}
        {isRunning && (
          <div className="flex gap-3 text-slate-500 leading-5">
            <span className="shrink-0">...</span>
            <span className="animate-pulse">_</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
