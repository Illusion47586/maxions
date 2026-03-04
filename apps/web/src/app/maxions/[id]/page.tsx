"use client";

import type { Maxion, MaxionLog } from "@maxions/db";
import type { LogLine } from "@maxions/ui";
import { LogTerminal, StatusBadge, StepTimeline } from "@maxions/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteMaxion,
  getMaxion,
  getMaxionLogs,
  getStreamUrl,
  killMaxion,
} from "@/lib/api";

// Monotonic counter — avoids duplicate keys when multiple SSE messages
// arrive within the same millisecond.
let lineSeq = 0;
function nextId(): number {
  lineSeq += 1;
  return lineSeq;
}

// SSE payload shapes match the server's SSEMessage.data structure
interface SSELogEvent {
  data: {
    data: string;
    step: MaxionLog["step"];
    stream: MaxionLog["stream"];
  };
  maxionId: string;
  type: "log";
}

interface SSEStatusEvent {
  data: {
    currentStep?: Maxion["currentStep"];
    error?: string;
    prNumber?: number;
    prUrl?: string;
    status: Maxion["status"];
  };
  maxionId: string;
  type: "status";
}

type SSEEvent = SSELogEvent | SSEStatusEvent;

function toLogLine(log: MaxionLog): LogLine {
  return {
    id: log.id,
    step: log.step,
    stream: log.stream,
    data: log.data,
    createdAt:
      log.createdAt instanceof Date
        ? log.createdAt.getTime()
        : Number(log.createdAt),
  };
}

interface JobDetailClientProps {
  id: string;
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setId(p.id)).catch(() => undefined);
  }, [params]);

  if (!id) {
    return null;
  }
  return <JobDetailClient id={id} />;
}

function JobDetailClient({ id }: JobDetailClientProps) {
  const router = useRouter();
  const [maxion, setMaxion] = useState<Maxion | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const handleDelete = useCallback(async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteMaxion(id);
      router.push("/maxions");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [id, router]);

  const handleCancel = useCallback(async () => {
    setCancelError(null);
    setCancelling(true);
    try {
      await killMaxion(id);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed");
      setCancelling(false);
    }
  }, [id]);

  // Initial load
  useEffect(() => {
    Promise.all([getMaxion(id), getMaxionLogs(id)])
      .then(([m, l]) => {
        setMaxion(m);
        setLines(l.map(toLogLine));
      })
      .catch(() => undefined);
  }, [id]);

  // SSE subscription
  useEffect(() => {
    const es = new EventSource(getStreamUrl(id));
    esRef.current = es;

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as SSEEvent;

        if (msg.type === "log") {
          setLines((prev) => [
            ...prev,
            {
              id: nextId(),
              step: msg.data.step,
              stream: msg.data.stream,
              data: msg.data.data,
              createdAt: Date.now(),
            },
          ]);
        } else if (msg.type === "status") {
          setMaxion((prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              status: msg.data.status,
              currentStep: msg.data.currentStep ?? prev.currentStep,
              prUrl: msg.data.prUrl ?? prev.prUrl,
              prNumber: msg.data.prNumber ?? prev.prNumber,
              errorMessage: msg.data.error ?? prev.errorMessage,
            };
          });

          const terminal: Maxion["status"][] = ["success", "failed", "timeout"];
          if (terminal.includes(msg.data.status)) {
            es.close();
          }
        }
      } catch {
        // malformed event — ignore
      }
    };

    return () => {
      es.close();
    };
  }, [id]);

  if (!maxion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }

  const failedStep =
    maxion.status === "failed" || maxion.status === "timeout"
      ? maxion.currentStep
      : undefined;

  const isRunning = maxion.status === "running";

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-start gap-4">
          <Link
            className="mt-1 shrink-0 text-slate-400 text-sm transition-colors hover:text-slate-200"
            href="/maxions"
          >
            ← All Maxions
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={maxion.status} />
              <span className="font-mono text-slate-500 text-xs">
                {maxion.branch}
              </span>
              {maxion.prUrl && (
                <a
                  className="rounded border border-blue-700 px-2 py-0.5 text-blue-400 text-xs transition-colors hover:text-blue-300"
                  href={maxion.prUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  View PR #{maxion.prNumber}
                </a>
              )}
              {deleteError && (
                <span className="text-red-400 text-xs">{deleteError}</span>
              )}
              {cancelError && (
                <span className="text-red-400 text-xs">{cancelError}</span>
              )}
              {(maxion.status === "running" || maxion.status === "queued") && (
                <button
                  aria-label="Cancel maxion"
                  className="ml-auto rounded border border-orange-800 px-2.5 py-1 text-orange-400 text-xs transition-colors hover:bg-orange-950 hover:text-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={cancelling}
                  onClick={handleCancel}
                  type="button"
                >
                  {cancelling ? "Cancelling…" : "Cancel"}
                </button>
              )}
              {confirmDelete ? (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-slate-400 text-xs">Sure?</span>
                  <button
                    className="rounded px-2 py-1 text-red-400 text-xs transition-colors hover:bg-red-950 disabled:opacity-50"
                    disabled={deleting}
                    onClick={handleDelete}
                    type="button"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    className="rounded px-2 py-1 text-slate-400 text-xs transition-colors hover:text-slate-200"
                    onClick={() => setConfirmDelete(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  aria-label="Delete maxion"
                  className="ml-auto rounded p-1.5 text-slate-600 transition-colors hover:bg-red-950 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                  disabled={
                    maxion.status === "running" || maxion.status === "queued"
                  }
                  onClick={() => setConfirmDelete(true)}
                  title={
                    maxion.status === "running" || maxion.status === "queued"
                      ? "Cannot delete a running or queued maxion"
                      : "Delete maxion"
                  }
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10 11v6M14 11v6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
            <p className="mt-2 text-slate-200">{maxion.task}</p>
            {maxion.errorMessage && (
              <p className="mt-1 text-red-400 text-sm">{maxion.errorMessage}</p>
            )}
          </div>
        </div>

        {/* Step timeline */}
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 px-6 py-4">
          <StepTimeline
            currentStep={maxion.currentStep}
            failedStep={failedStep}
            status={maxion.status}
          />
        </div>

        {/* Log terminal */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <LogTerminal isRunning={isRunning} lines={lines} />
        </div>
      </div>
    </div>
  );
}
