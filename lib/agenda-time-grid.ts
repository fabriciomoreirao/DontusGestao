export const AGENDA_SLOT_MINUTES = 30;
export const AGENDA_SLOT_HEIGHT = 42;
export const agendaTimeSlots = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * AGENDA_SLOT_MINUTES;
  return { minutes, label: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` };
});

type TimedEntry = { id: string; startsAt: string; endsAt: string };
export type PositionedAgendaEntry<T> = { entry: T; startMinute: number; endMinute: number; column: number; columns: number };

// Clip at Brasilia midnight and share horizontal space only between overlapping events.
export function positionAgendaEntries<T extends TimedEntry>(entries: T[], date: string): PositionedAgendaEntry<T>[] {
  const dayStart = Date.parse(`${date}T00:00:00-03:00`);
  const rows = entries.map(entry => ({ entry,
    startMinute: Math.max(0, (Date.parse(entry.startsAt) - dayStart) / 60_000),
    endMinute: Math.min(1440, (Date.parse(entry.endsAt) - dayStart) / 60_000),
    column: 0, columns: 1,
  })).filter(row => Number.isFinite(row.startMinute) && Number.isFinite(row.endMinute) && row.startMinute < row.endMinute)
    .sort((a,b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute || a.entry.id.localeCompare(b.entry.id));
  let group: typeof rows = [];
  let groupEnd = -1;
  let columnEnds: number[] = [];
  const finish = () => { for (const row of group) row.columns = columnEnds.length; };
  for (const row of rows) {
    if (row.startMinute >= groupEnd) { finish(); group = []; columnEnds = []; }
    let column = columnEnds.findIndex(end => end <= row.startMinute);
    if (column < 0) column = columnEnds.length;
    columnEnds[column] = row.endMinute;
    row.column = column;
    group.push(row);
    groupEnd = Math.max(...group.map(entry => entry.endMinute));
  }
  finish();
  return rows;
}
