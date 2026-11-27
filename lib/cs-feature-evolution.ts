import { dateKey, inDateRange } from "./date-range.ts";
import {
  featureNames,
  type FeatureSnapshot,
} from "./followup-feature-analytics.ts";

type Item = {
  id: string;
  title: string;
  customer_name?: string;
  owner: string;
  description?: string;
};
export type FeatureEvolutionRow = {
  id: string;
  clientId: string;
  clientName: string;
  itemId: string;
  track: string;
  responsible: string;
  inferredResponsible: boolean;
  actor: string;
  date: string;
  snapshot: FeatureSnapshot;
  delta: number;
};
const name = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/** Attribute history to the responsible saved at that time, even after transfers. */
export function csFeatureEvolution(
  items: readonly Item[],
): FeatureEvolutionRow[] {
  return items
    .flatMap((item) => {
      let detail;
      try {
        detail = JSON.parse(item.description || "{}");
      } catch {
        return [];
      }
      if (detail?.kind !== "csJourney" || !Array.isArray(detail.scoreEvolution))
        return [];
      return detail.scoreEvolution.flatMap((entry: unknown, index: number) => {
        if (!entry || typeof entry !== "object") return [];
        const snapshot = entry as FeatureSnapshot;
        if (
          !Number.isFinite(snapshot.score) ||
          !Number.isFinite(snapshot.previousScore) ||
          typeof snapshot.createdAt !== "string" ||
          !dateKey(snapshot.createdAt)
        )
          return [];
        return [
          {
            id: `${item.id}:${index}`,
            itemId: item.id,
            clientId: name(detail.clientId) || item.id,
            clientName: item.customer_name || item.title,
            track: detail.track === "retention" ? "Retenção" : "Ativação",
            responsible:
              name(snapshot.responsible) || name(item.owner) || "Não atribuído",
            inferredResponsible: !name(snapshot.responsible),
            actor: name(snapshot.actor) || "Não informado",
            date: dateKey(snapshot.createdAt),
            snapshot: {
              ...snapshot,
              featuresBase: featureNames(snapshot.featuresBase),
              featuresActive: featureNames(snapshot.featuresActive),
              featuresPlus: featureNames(snapshot.featuresPlus),
            },
            delta: snapshot.score - snapshot.previousScore,
          },
        ];
      });
    })
    .sort(
      (a, b) =>
        Date.parse(b.snapshot.createdAt) - Date.parse(a.snapshot.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

export function filterCsFeatureEvolution(
  rows: readonly FeatureEvolutionRow[],
  period: string,
  responsible: string,
  query = "",
) {
  const search = query.trim().toLocaleLowerCase("pt-BR");
  return rows.filter(
    (row) =>
      inDateRange(row.date, period) &&
      (responsible === "all" || row.responsible === responsible) &&
      (!search ||
        `${row.clientName} ${row.clientId} ${row.actor}`
          .toLocaleLowerCase("pt-BR")
          .includes(search)),
  );
}
