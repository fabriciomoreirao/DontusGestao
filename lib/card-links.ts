export function csCardFlow(description: string): "onboarding" | "evolution" | null {
  try {
    const detail = JSON.parse(description);
    return detail?.kind === "csJourney" ? detail.track === "retention" ? "evolution" : "onboarding" : null;
  } catch { return null; }
}

export function buildCardShareUrl(origin: string, currentUrl: string, module: string, id: string, options?: { csFlow?: string }) {
  const url = new URL(origin);
  const current = new URL(currentUrl);
  url.searchParams.set("mod", module);
  for (const key of ["commercialFlow", "csFlow"]) {
    const value = key === "csFlow" ? options?.csFlow || current.searchParams.get(key) : current.searchParams.get(key);
    if (value && ((key === "csFlow" && module === "cs") || (key === "commercialFlow" && module === "commercial"))) url.searchParams.set(key, value);
  }
  url.searchParams.set("card", id);
  if (module === "tasks") url.searchParams.set("task", id);
  if (module === "ti") url.searchParams.set("subtask", id);
  return url.toString();
}
