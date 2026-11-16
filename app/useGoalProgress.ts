"use client";

import { useEffect, useState } from "react";
import { goalProgressRevision } from "@/lib/goal-progress-request";

type GoalSummary = { id: string; version: number; actual: number };
export function useGoalProgress(items: { id: string; module: string; version: number }[]) {
  const [results, setResults] = useState<GoalSummary[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const revision = goalProgressRevision(items);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/goals/progress", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Não foi possível calcular as metas.");
        if (!controller.signal.aborted) { setResults(data); setError(""); }
      } catch (caught) {
        if (!controller.signal.aborted) setError((caught as Error).message);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision, refresh]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") setRefresh(value => value + 1); };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return { results, error, retry: () => setRefresh(value => value + 1) };
}
