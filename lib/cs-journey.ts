export type CsPhase = "validation" | "onboarding" | "tracking" | "conference" | "finished" | "unsuccessful" | "cancelled" | "cancelledWithoutTraining";

export const canResumeCsJourney = (phase: string) => ["unsuccessful", "cancelled", "cancelledWithoutTraining"].includes(phase);
export const isClosedCsJourney = (phase: string) => phase === "finished" || canResumeCsJourney(phase);

export function csDate(value: string | number = Date.now()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "";
}

type CsTimeline = { phase: string; startDate?: string; trackingStartedAt?: string; onboardingStartedAt?: string; conferenceConfirmedAt?: string; cancellationResolvedAt?: string };
export function csStartDate(journey: CsTimeline, item: { created_at: string }): string {
  return [journey.startDate, journey.trackingStartedAt, journey.onboardingStartedAt, item.created_at].map(value => value ? csDate(value) : "").find(Boolean) || "";
}

export function csTrackedDays(journey: CsTimeline, item: { created_at: string; updated_at: string }, now = Date.now()): number {
  const start = csStartDate(journey, item);
  const end = csDate(isClosedCsJourney(journey.phase) ? journey.conferenceConfirmedAt || journey.cancellationResolvedAt || item.updated_at : now);
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  return Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
}

export function requestCsConference<T extends { phase: string }>(journey: T, requestedAt: string) {
  if (journey.phase !== "onboarding" && journey.phase !== "tracking") throw new Error("A conferência está disponível no onboarding e no acompanhamento.");
  return { ...journey, phase: "conference" as const, status: "Conferência", conferenceFromPhase: journey.phase as "onboarding" | "tracking", conferenceRequestedAt: requestedAt };
}

// Preserve the previous cycle and its agenda references before starting validation again.
// The agenda entries and the complete interaction history remain available for consultation.
const cycleFields = [
  "startDate", "scheduledAt", "checkedAt", "checkedBy", "onboardingStartedAt", "trackingStartedAt",
  "firstMeetingAt", "firstMeetingTime", "firstMeetingCommitmentId", "firstMeetingCompletedAt",
  "trainingAt", "trainingTime", "trainingCommitmentId", "trainingCompletedAt",
  "singleAlignmentAt", "singleAlignmentTime", "singleAlignmentCommitmentId", "singleAlignmentCompletedAt",
  "rescheduledAt", "rescheduledTime", "meetingLink", "finalReason", "approvalReason", "rejectionReason",
  "conferenceRequestedAt", "conferenceConfirmedAt", "conferenceFromPhase", "cancellationRequestedAt", "cancellationRequestedBy",
  "cancellationTaskId", "cancellationTaskProtocol", "cancellationTaskLink", "cancellationOutcome",
  "cancellationPendingApproval", "cancellationReason", "cancellationResolvedAt", "usage", "callStatus", "usageByDay",
] as const;

export function resumeCsJourney<T extends { phase: string; status?: string; previousCycles?: Record<string, unknown>[] }>(journey: T, resumedAt: string, actor: string): Omit<T, "phase" | "status" | (typeof cycleFields)[number]> & { phase: "validation"; status: "Pendente"; usageByDay: Record<string, string>; previousCycles: Record<string, unknown>[] } {
  if (!canResumeCsJourney(journey.phase)) throw new Error("Esta jornada não está disponível para retomada.");
  const next = { ...journey };
  const fields = next as Record<string, unknown>;
  const previous: Record<string, unknown> = { phase: journey.phase, status: journey.status, resumedAt, actor };
  for (const key of cycleFields) { if (key in fields) previous[key] = fields[key]; delete fields[key]; }
  return { ...next, phase: "validation", status: "Pendente", usageByDay: {}, previousCycles: [...(journey.previousCycles ?? []), previous] };
}

export function csOutcome(phase: unknown, status: unknown): "active" | "success" | "failure" {
  const text = String(status ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (canResumeCsJourney(String(phase)) || /cancel|sem sucesso|sem retorno|falta de retorno|reprov/.test(text)) return "failure";
  if (phase === "finished" || /finaliz|conclu|sucesso|aprov/.test(text)) return "success";
  return "active";
}
