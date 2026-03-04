import type { Maxion, MaxionLog } from "@maxions/db";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export async function createMaxion(task: string): Promise<Maxion> {
  const res = await fetch(`${API_BASE}/maxions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create maxion: ${res.statusText}`);
  }
  return res.json() as Promise<Maxion>;
}

export async function listMaxions(): Promise<Maxion[]> {
  const res = await fetch(`${API_BASE}/maxions`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to list maxions: ${res.statusText}`);
  }
  return res.json() as Promise<Maxion[]>;
}

export async function getMaxion(id: string): Promise<Maxion> {
  const res = await fetch(`${API_BASE}/maxions/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to get maxion: ${res.statusText}`);
  }
  return res.json() as Promise<Maxion>;
}

export async function getMaxionLogs(id: string): Promise<MaxionLog[]> {
  const res = await fetch(`${API_BASE}/maxions/${id}/logs`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to get maxion logs: ${res.statusText}`);
  }
  return res.json() as Promise<MaxionLog[]>;
}

export function getStreamUrl(id: string): string {
  return `${API_BASE}/maxions/${id}/stream`;
}

export async function deleteMaxion(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/maxions/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Failed to delete maxion: ${res.statusText}`
    );
  }
}

export async function killMaxion(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/maxions/${id}/kill`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Failed to cancel maxion: ${res.statusText}`
    );
  }
}
