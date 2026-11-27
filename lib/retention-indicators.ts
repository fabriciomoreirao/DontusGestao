import { indicatorDetail, type IndicatorRecord } from "./field-indicators.ts";
import { scopeCommercialIndicatorItems } from "./commercial-indicators.ts";
import { inDateRange } from "./date-range.ts";
import { crmResponsible } from "./crm-responsibles.ts";

type Source = { id: string; module?: string; description?: string };
export type RetentionEntry = {
  item: IndicatorRecord & { module: string; title: string };
  detail: Record<string, unknown>;
  date: string;
  seller: string;
  stage: string;
  version: string;
  crm: string;
  outcome: "success" | "failure" | "process";
};
const text = (...values: unknown[]) =>
  String(
    values.find((value) => typeof value === "string" && value.trim()) || "",
  );
const clean = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

type FunnelCatalog = { catalog: string; name: string; description: string };
function retentionStageOutcomes(catalogs: readonly FunnelCatalog[]) {
  const outcomes = new Map<string, { won: boolean; lost: boolean }>();
  for (const catalog of catalogs) {
    if (catalog.catalog !== "funnelStage") continue;
    const config = indicatorDetail(catalog);
    const stages = config.s ?? config.stages;
    if (!Array.isArray(stages)) continue;
    for (const stage of stages) {
      if (!stage || typeof stage !== "object") continue;
      const name = Array.isArray(stage) ? stage[0] : stage.name;
      const won = Array.isArray(stage) ? stage[2] : stage.won;
      const lost = Array.isArray(stage) ? stage[3] : stage.lost;
      if (typeof name === "string")
        outcomes.set(`${clean(catalog.name)}:${clean(name)}`, {
          won: won === true || won === 1,
          lost: lost === true || lost === 1,
        });
    }
  }
  return outcomes;
}

/** Match the CRM board's creation/update period before pagination. */
export function matchesRetentionPeriod(entry: RetentionEntry, period: string) {
  return (
    inDateRange(entry.item.created_at, period) ||
    inDateRange(entry.item.updated_at, period)
  );
}

/** Build once per snapshot. Other modules can contain large embedded files. */
export function retentionOnboardingLeadIds(items: readonly Source[]) {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.module !== "cs") continue;
    const detail = indicatorDetail(item);
    if (detail.kind !== "csJourney" || detail.track !== "retention") continue;
    if (typeof detail.sourceLeadId === "string") ids.add(detail.sourceLeadId);
    if (Array.isArray(detail.cycles))
      for (const cycle of detail.cycles)
        if (cycle && typeof cycle.sourceRetentionLeadId === "string")
          ids.add(cycle.sourceRetentionLeadId);
  }
  return ids;
}
export function retentionEntries(
  items: RetentionEntry["item"][],
  context: string,
  catalogs: readonly FunnelCatalog[] = [],
): RetentionEntry[] {
  const forwarded = retentionOnboardingLeadIds(items);
  const outcomes = retentionStageOutcomes(catalogs);
  return scopeCommercialIndicatorItems(items, context).map((item) => {
    const detail = indicatorDetail(item),
      stage = text(detail.stage, item.status) || "Sem etapa";
    const configured = outcomes.get(
      `${clean(text(detail.funnel))}:${clean(stage)}`,
    );
    const failed =
      configured?.lost ||
      /sem sucesso|perdid|cancelad|reprovad/.test(clean(stage));
    const successfulStage =
      configured?.won ||
      /(?:enviad|encaminhad|direcionad).*\b(?:onboarding|acompanhamento)\b|\bcom sucesso\b|\bganh[oa]\b/.test(
        clean(stage),
      );
    const sent =
      detail.onboarding &&
      typeof detail.onboarding === "object" &&
      Boolean((detail.onboarding as Record<string, unknown>).sentAt);
    return {
      item,
      detail,
      stage,
      date: text(detail.saleDate, detail.entryDate, item.created_at).slice(
        0,
        10,
      ),
      seller: text(crmResponsible(item), detail.sellerName) || "Não atribuído",
      version: text(detail.version) || "Sem versão",
      crm: text(detail.funnel) || "Sem CRM",
      outcome: failed
        ? "failure"
        : successfulStage || sent || forwarded.has(item.id)
          ? "success"
          : "process",
    };
  });
}
type Summary = {
  total: number;
  process: number;
  success: number;
  failure: number;
  conversion: number;
};
const empty = (): Summary => ({
  total: 0,
  process: 0,
  success: 0,
  failure: 0,
  conversion: 0,
});
export function summarizeRetention(entries: RetentionEntry[]) {
  const summary = empty(),
    versions = new Map<string, Summary>(),
    owners = new Map<string, Summary>(),
    stages = new Map<string, number>();
  const add = (row: Summary, entry: RetentionEntry) => {
    row.total++;
    row[entry.outcome]++;
  };
  for (const entry of entries) {
    add(summary, entry);
    const version = versions.get(entry.version) || empty(),
      owner = owners.get(entry.seller) || empty();
    add(version, entry);
    add(owner, entry);
    versions.set(entry.version, version);
    owners.set(entry.seller, owner);
    stages.set(entry.stage, (stages.get(entry.stage) || 0) + 1);
  }
  const finish = (row: Summary) => ({
    ...row,
    conversion: row.total
      ? Math.round((row.success / row.total) * 1000) / 10
      : 0,
  });
  const rows = (map: Map<string, Summary>) =>
    [...map]
      .map(([name, row]) => ({ name, ...finish(row) }))
      .sort(
        (a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"),
      );
  return {
    ...finish(summary),
    versionRows: rows(versions),
    ownerRows: rows(owners),
    funnel: [...stages].map(([label, count]) => ({ label, count })),
  };
}
