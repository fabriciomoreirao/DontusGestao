export type LiaPromptItem = { id: string; module: string; record_type: string; title: string; owner: string; description?: string; created_at: string };
export type LiaPromptEntry = { item: LiaPromptItem; clientId: string; date: string; type: string; responsible: string; reviewer: string; status: string; tested: boolean; reviewHours: number | null };
export const LIA_PROMPT_STATUSES = { adjustments: "Ajustes", conference: "Em conferência", rejected: "Reprovado", approved: "Aprovado" };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
function dateKey(value: unknown): string {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) { const date = new Date(`${raw}T12:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === raw ? raw : ""; }
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? dateFormatter.format(timestamp) : "";
}

export function liaPromptEntries(items: LiaPromptItem[]): LiaPromptEntry[] {
  return items.flatMap(item => {
    if (item.module !== "lia" || item.record_type !== "Ajuste de Prompt") return [];
    try {
      const detail = JSON.parse(item.description ?? "{}");
      if (detail?.kind !== "liaPromptAdjustment") return [];
      const sent = Date.parse(detail.sentAt), decision = Date.parse(detail.decisionAt);
      const status = Object.hasOwn(LIA_PROMPT_STATUSES, detail.reviewStatus) ? detail.reviewStatus : "adjustments";
      return [{ item, clientId: text(detail.clientId), date: dateKey(detail.date) || dateKey(item.created_at), type: text(detail.adjustmentType) || "Não informado",
        responsible: text(detail.responsible) || item.owner || "Não atribuído", reviewer: text(detail.reviewer) || text(detail.decisionBy) || "Não atribuído", status,
        tested: detail.tested === true, reviewHours: ["approved", "rejected"].includes(status) && Number.isFinite(sent) && Number.isFinite(decision) && decision >= sent ? (decision - sent) / 3_600_000 : null }];
    } catch { return []; }
  });
}

export type LiaPromptFilters = { from?: string; to?: string; responsible?: string; reviewer?: string; type?: string; status?: string; tested?: string };
export function filterLiaPrompts(entries: LiaPromptEntry[], filters: LiaPromptFilters): LiaPromptEntry[] {
  const selected = (filter: string | undefined, value: string) => !filter || filter === "all" || filter === value;
  return entries.filter(entry => (!filters.from || entry.date >= filters.from) && (!filters.to || Boolean(entry.date && entry.date <= filters.to))
    && selected(filters.responsible, entry.responsible) && selected(filters.reviewer, entry.reviewer) && selected(filters.type, entry.type) && selected(filters.status, entry.status)
    && (!filters.tested || filters.tested === "all" || (filters.tested === "yes") === entry.tested));
}

export function liaPromptMetrics(entries: LiaPromptEntry[]) {
  const approved = entries.filter(entry => entry.status === "approved").length;
  const rejected = entries.filter(entry => entry.status === "rejected").length;
  const reviewed = entries.map(entry => entry.reviewHours).filter((hours): hours is number => hours !== null);
  return { total: entries.length, approved, rejected, conference: entries.filter(entry => entry.status === "conference").length,
    pending: entries.filter(entry => entry.status === "adjustments").length, tested: entries.filter(entry => entry.tested).length,
    clients: new Set(entries.map(entry => entry.clientId).filter(Boolean)).size, approvalRate: approved + rejected ? Math.round(approved / (approved + rejected) * 100) : 0,
    averageReviewHours: reviewed.length ? reviewed.reduce((sum, value) => sum + value, 0) / reviewed.length : null };
}

export function liaPromptDistribution(entries: LiaPromptEntry[], field: "status" | "type" | "responsible" | "reviewer" | "tested") {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const label = field === "status" ? LIA_PROMPT_STATUSES[entry.status as keyof typeof LIA_PROMPT_STATUSES] : field === "tested" ? entry.tested ? "Testado" : "Não testado" : entry[field];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a,b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function liaPromptMonthlyVolume(entries: LiaPromptEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) if (entry.date) { const month = entry.date.slice(0,7); counts.set(month, (counts.get(month) ?? 0) + 1); }
  return [...counts].sort(([a],[b]) => a.localeCompare(b)).map(([month, value]) => ({ label: `${month.slice(5)}/${month.slice(0,4)}`, value }));
}
