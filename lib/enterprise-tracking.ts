import { customerSuccessScore } from "./commission-rules.ts";
import { hasTrainingPending } from "./followup-insights.ts";

type UnitIdentity = {
  followUp?: Tracking;
  followUpUpdatedAt?: string;
  trainingRequired?: boolean;
  id: string;
  customerId?: string;
  externalId: string;
};
type JourneyRecord = {
  id: string;
  module?: string;
  customer_id?: string | null;
  description: string;
  updated_at: string;
};
type Tracking = {
  trainingRequired?: boolean;
  sourceLeadId?: string;
  kind?: string;
  track?: string;
  phase?: string;
  firstMeetingCompletedAt?: string;
  trainingCompletedAt?: string;
  singleAlignmentCompletedAt?: string;
  clientId?: string;
  strategicNetworkId?: string;
  strategicUnitId?: string;
  featuresBase?: string[];
  featuresActive?: string[];
  featuresPlus?: string[];
  usage?: string;
  follows?: { createdAt: string; kind?: string }[];
};
type Candidate = { record: JourneyRecord; detail: Tracking };
const lookupCache = new WeakMap<
  JourneyRecord[],
  { units: Map<string, Candidate[]>; customers: Map<string, Candidate[]> }
>();

function journeyLookup(records: JourneyRecord[]) {
  const cached = lookupCache.get(records);
  if (cached) return cached;
  const lookup = {
    units: new Map<string, Candidate[]>(),
    customers: new Map<string, Candidate[]>(),
  };
  const add = (
    map: Map<string, Candidate[]>,
    key: string,
    candidate: Candidate,
  ) => map.set(key, [...(map.get(key) ?? []), candidate]);
  for (const record of records) {
    if (record.module && record.module !== "cs") continue;
    let detail: Tracking;
    try {
      detail = JSON.parse(record.description);
    } catch {
      continue;
    }
    if (detail?.kind !== "csJourney" || detail.track !== "activation") continue;
    const candidate = { record, detail };
    if (detail.strategicUnitId)
      add(
        lookup.units,
        `${detail.strategicNetworkId}:${detail.strategicUnitId}`,
        candidate,
      );
    else
      for (const identity of new Set(
        [record.customer_id, detail.clientId].filter((value): value is string =>
          Boolean(value),
        ),
      ))
        add(lookup.customers, identity, candidate);
  }
  lookupCache.set(records, lookup);
  return lookup;
}

export function strategicUnitJourney(
  unit: UnitIdentity,
  networkId: string,
  records: JourneyRecord[],
) {
  if (unit.followUp?.kind === "csJourney") {
    return {
      record: {
        id: networkId,
        description: JSON.stringify(unit.followUp),
        updated_at: unit.followUpUpdatedAt || "",
      },
      detail: unit.followUp,
      linked: true,
    };
  }
  const lookup = journeyLookup(records);
  const exact = lookup.units.get(`${networkId}:${unit.id}`) ?? [];
  const legacy = [unit.customerId, unit.externalId]
    .filter((value): value is string => Boolean(value))
    .flatMap((identity) => lookup.customers.get(identity) ?? []);
  const matches = [
    ...exact.map((candidate) => ({ ...candidate, linked: true })),
    ...legacy.map((candidate) => ({ ...candidate, linked: false })),
  ].sort(
    (a, b) =>
      Number(b.linked) - Number(a.linked) ||
      b.record.updated_at.localeCompare(a.record.updated_at),
  );
  return matches[0];
}

export function strategicTracking(
  unit: UnitIdentity,
  networkId: string,
  records: JourneyRecord[],
) {
  const match = strategicUnitJourney(unit, networkId, records);
  if (!match) return { trainingPending: unit.trainingRequired === true };
  const lastInteractionAt = (match.detail.follows ?? [])
    .filter(
      (entry) =>
        !/^(Conta estratégica|Origem comercial|Edição cadastral|Inserção manual)$/.test(
          entry.kind || "",
        ),
    )
    .map((entry) => entry.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  return {
    trainingPending: hasTrainingPending(match.detail),
    trackingScore: customerSuccessScore(match.detail),
    usageStatus: match.detail.usage || "Não iniciada",
    lastAnalysis: match.record.updated_at,
    lastInteractionAt,
  };
}

export function pendingStrategicUnits(units: { pendingFollowUp?: boolean }[]) {
  return units.filter((unit) => unit.pendingFollowUp === true).length;
}

export const enterpriseInteractionTypes = [
  "Comentário",
  "Reunião",
  "Alinhamento",
  "Ligação",
  "WhatsApp",
] as const;

/** Keep manual contacts separate from system changes without rewriting stored history. */
export function splitEnterpriseHistory<T extends { type?: string }>(
  entries: readonly T[],
) {
  const comments: T[] = [],
    history: T[] = [];
  for (const entry of [...entries].reverse()) {
    const type = (entry.type || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
    const manual =
      !type ||
      /^(comentarios?|reuniao|alinhamento|ligacao|whatsapp|mensagem|contato|observacao|analise|follow.?up)$/.test(
        type,
      );
    (manual ? comments : history).push(entry);
  }
  return { comments, history };
}

export function lastStrategicInteraction(
  history: { createdAt: string; type: string; unitId?: string }[],
  unitId?: string,
) {
  return history
    .filter(
      (entry) =>
        (!unitId || entry.unitId === unitId) &&
        !/^(Cadastro|Cadastro de cliente|Venda direta|Atualização interna)$/.test(
          entry.type,
        ),
    )
    .map((entry) => entry.createdAt)
    .sort()
    .at(-1);
}
