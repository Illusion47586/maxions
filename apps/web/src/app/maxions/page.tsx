"use client";

import type { Maxion } from "@maxions/db";
import { StatusBadge } from "@maxions/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NewMaxionModal } from "@/components/new-maxion-modal";
import { deleteMaxion, listMaxions } from "@/lib/api";

export default function MaxionsPage() {
  const [maxions, setMaxions] = useState<Maxion[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    listMaxions()
      .then((data) => setMaxions(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    setDeleteError(null);
    try {
      await deleteMaxion(id);
      setMaxions((prev) => prev.filter((m) => m.id !== id));
      setConfirmId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }, []);

  return (
    <>
      {showModal && <NewMaxionModal onClose={() => setShowModal(false)} />}

      <div className="min-h-screen bg-slate-950 px-6 py-10">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                className="text-slate-400 text-sm transition-colors hover:text-slate-200"
                href="/"
              >
                ← Home
              </Link>
              <h1 className="font-bold text-2xl text-slate-100">All Maxions</h1>
            </div>
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-sm text-white transition-colors hover:bg-blue-500"
              onClick={() => setShowModal(true)}
              type="button"
            >
              + Run Maxion
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900">
            {maxions.length === 0 ? (
              <div className="px-5 py-16 text-center text-slate-500 text-sm">
                No maxions yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-slate-800 border-b text-left font-medium text-slate-500 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Task</th>
                    <th className="px-5 py-3">Branch</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3">PR</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {maxions.map((m) => {
                    const canDelete =
                      m.status !== "running" && m.status !== "queued";
                    return (
                      <tr
                        className="transition-colors hover:bg-slate-800/40"
                        key={m.id}
                      >
                        <td className="px-5 py-3">
                          <StatusBadge status={m.status} />
                        </td>
                        <td className="max-w-xs px-5 py-3">
                          <Link
                            className="block truncate text-slate-200 transition-colors hover:text-blue-400"
                            href={`/maxions/${m.id}`}
                            title={m.task}
                          >
                            {m.task.length > 80
                              ? `${m.task.slice(0, 80)}…`
                              : m.task}
                          </Link>
                        </td>
                        <td className="px-5 py-3 font-mono text-slate-400 text-xs">
                          {m.branch}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs">
                          {new Date(m.createdAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-3">
                          {m.prUrl ? (
                            <a
                              className="text-blue-400 transition-colors hover:text-blue-300"
                              href={m.prUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              #{m.prNumber}
                            </a>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {confirmId === m.id ? (
                            <span className="inline-flex items-center gap-2">
                              {deleteError && confirmId === m.id && (
                                <span className="text-red-400 text-xs">
                                  {deleteError}
                                </span>
                              )}
                              <span className="text-slate-400 text-xs">
                                Sure?
                              </span>
                              <button
                                className="rounded px-2 py-0.5 text-red-400 text-xs transition-colors hover:bg-red-950 disabled:opacity-50"
                                disabled={deleting === m.id}
                                onClick={() => handleDelete(m.id)}
                                type="button"
                              >
                                {deleting === m.id
                                  ? "Deleting…"
                                  : "Yes, delete"}
                              </button>
                              <button
                                className="rounded px-2 py-0.5 text-slate-400 text-xs transition-colors hover:bg-slate-800"
                                onClick={() => {
                                  setConfirmId(null);
                                  setDeleteError(null);
                                }}
                                type="button"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              aria-label="Delete maxion"
                              className="rounded p-1 text-slate-600 transition-colors hover:bg-red-950 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                              disabled={!canDelete}
                              onClick={() => setConfirmId(m.id)}
                              title={
                                canDelete
                                  ? "Delete"
                                  : "Cannot delete a running or queued maxion"
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
