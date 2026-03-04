"use client";

import type { Maxion } from "@maxions/db";
import { StatusBadge } from "@maxions/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NewMaxionModal } from "@/components/new-maxion-modal";
import { listMaxions } from "@/lib/api";

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="font-medium text-slate-400 text-sm">{label}</p>
      <p className={`mt-1 font-bold text-3xl ${color}`}>{value}</p>
    </div>
  );
}

export default function HomePage() {
  const [maxions, setMaxions] = useState<Maxion[]>([]);
  const [showModal, setShowModal] = useState(false);

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

  const total = maxions.length;
  const running = maxions.filter((m) => m.status === "running").length;
  const success = maxions.filter((m) => m.status === "success").length;
  const failed = maxions.filter(
    (m) => m.status === "failed" || m.status === "timeout"
  ).length;

  const recent = maxions.slice(0, 5);

  return (
    <>
      {showModal && <NewMaxionModal onClose={() => setShowModal(false)} />}

      <div className="min-h-screen bg-slate-950 px-6 py-10">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="font-bold text-3xl text-slate-100">Maxions</h1>
              <p className="mt-1 text-slate-400 text-sm">
                One-shot coding agent platform
              </p>
            </div>
            <button
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-sm text-white transition-colors hover:bg-blue-500"
              onClick={() => setShowModal(true)}
              type="button"
            >
              + Run Maxion
            </button>
          </div>

          {/* Stats */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard color="text-slate-100" label="Total" value={total} />
            <StatCard color="text-blue-400" label="Running" value={running} />
            <StatCard color="text-green-400" label="Success" value={success} />
            <StatCard color="text-red-400" label="Failed" value={failed} />
          </div>

          {/* Recent jobs */}
          <div className="rounded-xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-slate-800 border-b px-5 py-4">
              <h2 className="font-semibold text-slate-200">Recent Maxions</h2>
              <Link
                className="text-blue-400 text-sm transition-colors hover:text-blue-300"
                href="/maxions"
              >
                View all
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className="px-5 py-12 text-center text-slate-500 text-sm">
                No maxions yet. Run your first one!
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {recent.map((m) => (
                  <li key={m.id}>
                    <Link
                      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-800/50"
                      href={`/maxions/${m.id}`}
                    >
                      <StatusBadge status={m.status} />
                      <span className="flex-1 truncate text-slate-300 text-sm">
                        {m.task}
                      </span>
                      <span className="shrink-0 text-slate-500 text-xs">
                        {m.branch}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
