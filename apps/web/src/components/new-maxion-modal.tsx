"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createMaxion } from "@/lib/api";

interface NewMaxionModalProps {
  onClose: () => void;
}

export function NewMaxionModal({ onClose }: NewMaxionModalProps) {
  const router = useRouter();
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const maxion = await createMaxion(task.trim());
      router.push(`/maxions/${maxion.id}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on backdrop click (outside the panel)
  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!panelRef.current?.contains(e.target as Node)) {
      onClose();
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop pattern
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: modal backdrop pattern
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handled via document listener
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
        ref={panelRef}
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg text-slate-100">
            Run a new Maxion
          </h2>
          <button
            className="text-slate-400 transition-colors hover:text-slate-200"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            className="mb-2 block font-medium text-slate-300 text-sm"
            htmlFor="task"
          >
            Task description
          </label>
          <textarea
            autoFocus
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            disabled={loading}
            id="task"
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Add a --verbose flag to the CLI that prints debug output"
            rows={4}
            value={task}
          />

          {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}

          <div className="mt-4 flex justify-end gap-3">
            <button
              className="rounded-lg px-4 py-2 font-medium text-slate-400 text-sm transition-colors hover:text-slate-200 disabled:opacity-50"
              disabled={loading}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading || !task.trim()}
              type="submit"
            >
              {loading ? "Launching..." : "Run Maxion"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
