import type { ModuleKey } from "./domain";

export const ADMIN_PAGES = ["collaborators", "employeeIndicators", "departments", "levels", "roles", "agenda", "customers", "suggestions", "commercialCatalogs", "csCatalogs", "liaCatalogs", "serviceCatalogs", "waitingQueueCatalogs", "enterpriseCatalogs", "cancellationCatalogs", "hrCatalogs", "referralCatalogs", "recruitmentCatalogs", "recruitment", "audit", "notices", "background", "permissions", "links"] as const;
export type AdminPage = typeof ADMIN_PAGES[number];
export type WorkspaceRoute = {
  module: ModuleKey; adminPage?: AdminPage; commercialFlow?: "qualification" | "crm" | "retention";
  csFlow?: "onboarding" | "evolution" | "enterprise"; reportingSection?: "performance" | "indicators" | "bi" | "biExecutive";
  catalog?: "departments" | "types" | "priorities" | "statuses" | "kanban" | "sla" | "people";
};
const choice = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined => allowed.includes(value as T) ? value as T : undefined;

export function readWorkspaceRoute(search: string, modules: readonly string[]): WorkspaceRoute {
  const params = new URLSearchParams(search);
  const module = (modules.includes(params.get("mod") ?? "") ? params.get("mod") : "dashboard") as ModuleKey;
  return {
    module,
    adminPage: module === "admin" ? choice(params.get("adminPage"), ADMIN_PAGES) ?? "collaborators" : undefined,
    commercialFlow: module === "commercial" ? choice(params.get("commercialFlow"), ["qualification", "crm", "retention"] as const) ?? "qualification" : undefined,
    csFlow: module === "cs" ? choice(params.get("csFlow"), ["onboarding", "evolution", "enterprise"] as const) ?? "onboarding" : undefined,
    reportingSection: module === "reporting" ? choice(params.get("reportingSection"), ["performance", "indicators", "bi", "biExecutive"] as const) ?? "bi" : undefined,
    catalog: module === "catalogs" ? choice(params.get("cad"), ["departments", "types", "priorities", "statuses", "kanban", "sla", "people"] as const) ?? "departments" : undefined,
  };
}

export function workspaceRouteUrl(current: string, route: WorkspaceRoute): URL {
  const url = new URL(current);
  for (const key of ["mod", "adminPage", "commercialFlow", "csFlow", "reportingSection", "cad", "analyticsDepartment", "view", "clientId", "card", "subtask", "lead", "task", "suggestion", "commission", "referral", "cancellation", "client"]) url.searchParams.delete(key);
  if (route.module !== "dashboard") url.searchParams.set("mod", route.module);
  if (route.module === "admin" && route.adminPage) url.searchParams.set("adminPage", route.adminPage);
  if (route.module === "commercial" && route.commercialFlow) url.searchParams.set("commercialFlow", route.commercialFlow);
  if (route.module === "cs" && route.csFlow) url.searchParams.set("csFlow", route.csFlow);
  if (route.module === "reporting" && route.reportingSection) url.searchParams.set("reportingSection", route.reportingSection);
  if (route.module === "catalogs" && route.catalog) url.searchParams.set("cad", route.catalog);
  return url;
}

export const normalizeWorkspaceSearch = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
export const workspaceDestinationKey = (route: WorkspaceRoute) => [route.module, route.adminPage, route.commercialFlow, route.csFlow, route.reportingSection, route.catalog].filter(Boolean).join(":");

export function pushWorkspaceHistory(url: URL) {
  const index = Number(window.history.state?.dontusIndex ?? 0) + 1;
  window.history.pushState({ ...window.history.state, dontusIndex: index }, "", url);
  try { sessionStorage.setItem("dontus:navigation-highest", String(index)); } catch { /* optional storage */ }
  window.dispatchEvent(new Event("dontus:navigate"));
}

export function matchWorkspaceDestinations<T extends { label: string; group: string; description: string }>(entries: T[], query: string): T[] {
  const words = normalizeWorkspaceSearch(query).split(/\s+/).filter(Boolean);
  return entries.filter(entry => words.every(word => normalizeWorkspaceSearch(`${entry.label} ${entry.group} ${entry.description}`).includes(word)));
}

export function readNavigationPreferences(raw: string | null): { favorites: string[]; recent: string[] } {
  try {
    const value = JSON.parse(raw ?? "{}");
    const list = (input: unknown, limit: number) => [...new Set((Array.isArray(input) ? input : []).filter((item): item is string => typeof item === "string" && item.length <= 160))].slice(0, limit);
    return { favorites: list(value?.favorites, 20), recent: list(value?.recent, 6) };
  } catch { return { favorites: [], recent: [] }; }
}
