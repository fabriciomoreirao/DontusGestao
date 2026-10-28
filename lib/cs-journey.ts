export type CsPhase = "validation" | "onboarding" | "tracking" | "conference" | "finished" | "unsuccessful" | "cancelled" | "cancelledWithoutTraining";

export const canResumeCsJourney = (phase: string) => ["unsuccessful", "cancelled", "cancelledWithoutTraining"].includes(phase);
export const isClosedCsJourney = (phase: string) => phase === "finished" || canResumeCsJourney(phase);

export function requestCsConference<T extends { phase: string }>(journey: T, requestedAt: string) {
  if (journey.phase !== "onboarding" && journey.phase !== "tracking") throw new Error("A conferência está disponível no onboarding e no acompanhamento.");
  return { ...journey, phase: "conference" as const, status: "Conferência", conferenceFromPhase: journey.phase as "onboarding" | "tracking", conferenceRequestedAt: requestedAt };
}

// Preserve the previous cycle and its agenda references before starting validation again.
// The agenda entries and the complete interaction history remain available for consultation.
const cycleFields = [
  "scheduledAt", "checkedAt", "checkedBy", "onboardingStartedAt", "trackingStartedAt",
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
