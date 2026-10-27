export const COMMERCIAL_AVAILABILITY_BLOCK_PREFIX = "[BLOQUEIO COMERCIAL]";
export const COMMERCIAL_SLOT_TIMES = ["09:30", "11:00", "14:00", "16:00"];
type Commitment = { agendaId: string; title: string; startsAt: string; endsAt: string; statusName: string };
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

export function commercialDateKey(now: number = Date.now()) {
  const parts = dateFormatter.formatToParts(new Date(now));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const commercialSlotStartsAt = (date: string, slot: string) => new Date(`${date}T${slot}:00-03:00`).toISOString();
export const isCommercialAvailabilityBlock = (entry: { title: string }) => entry.title.trim().toLocaleUpperCase("pt-BR").startsWith(COMMERCIAL_AVAILABILITY_BLOCK_PREFIX);
const isCancelled = (entry: Commitment) => /cancel/i.test(entry.statusName);

export function commercialSlotIsBlocked(commitments: Commitment[], agendaId: string, date: string, slot: string, durationMinutes = 60) {
  if (!date || !slot) return false;
  const start = Date.parse(commercialSlotStartsAt(date, slot));
  const end = start + durationMinutes * 60_000;
  return commitments.some((entry) => entry.agendaId === agendaId && !isCancelled(entry) && isCommercialAvailabilityBlock(entry)
    && Date.parse(entry.startsAt) < end && Date.parse(entry.endsAt) > start);
}

export function availableCommercialSlots({ date, agendaId, commitments, now = Date.now(), holiday = false }: {
  date: string; agendaId?: string; commitments: Commitment[]; now?: number; holiday?: boolean;
}) {
  if (!agendaId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < commercialDateKey(now) || holiday) return [];
  const noon = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(noon) || commercialDateKey(noon) !== date) return [];
  const weekday = new Date(noon).getUTCDay();
  if (weekday === 0 || weekday === 6 || !Number.isFinite(weekday)) return [];
  const active = commitments.filter((entry) => entry.agendaId === agendaId && !isCancelled(entry) && !isCommercialAvailabilityBlock(entry));
  return COMMERCIAL_SLOT_TIMES.filter((slot) => {
    const start = Date.parse(commercialSlotStartsAt(date, slot));
    if (start <= now || commercialSlotIsBlocked(commitments, agendaId, date, slot)) return false;
    const slotCommitments = active.filter((entry) => Math.floor(Date.parse(entry.startsAt) / 60_000) === Math.floor(start / 60_000));
    return slotCommitments.length < 3;
  });
}
