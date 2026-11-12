export type AgendaStatusAlert = {
  id: string;
  title: string;
  startsAt: string;
  statusChangedAt?: string | null;
};

export type AgendaStatusCommitment = AgendaStatusAlert & {
  responsibleUserId: string;
  statusName: string;
};

const DAY_MS = 86_400_000;
const BRASILIA_OFFSET_MS = -3 * 60 * 60 * 1000;
const brasiliaDay = (timestamp: number) => Math.floor((timestamp + BRASILIA_OFFSET_MS) / DAY_MS);

// Count previous calendar dates in Brasília, starting from the appointment date
// or the last status change, whichever is later.
export function agendaNeedsStatusUpdate(entry: AgendaStatusAlert, now = Date.now()): boolean {
  const startsAt = Date.parse(entry.startsAt);
  const changedAt = Date.parse(entry.statusChangedAt ?? "");
  if (![startsAt, changedAt, now].every(Number.isFinite)) return false;
  const cutoffDay = brasiliaDay(now) - 3;
  return brasiliaDay(startsAt) <= cutoffDay && brasiliaDay(changedAt) <= cutoffDay;
}

export function agendaStatusAlerts({ alerts, commitments, currentUserId, now = Date.now() }: {
  alerts?: AgendaStatusAlert[];
  commitments?: AgendaStatusCommitment[];
  currentUserId?: string;
  now?: number;
}): AgendaStatusAlert[] {
  // Current commitments are authoritative, including an empty or updated list.
  if (commitments !== undefined) {
    if (!currentUserId) return [];
    return commitments.filter(entry => entry.responsibleUserId === currentUserId
      && entry.statusName.replace(/[^a-z]/gi, "").toLowerCase() === "agendado"
      && agendaNeedsStatusUpdate(entry, now));
  }
  return (alerts ?? []).filter(entry => agendaNeedsStatusUpdate(entry, now));
}
