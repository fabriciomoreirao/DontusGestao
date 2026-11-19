const zone = "America/Sao_Paulo";
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const labelFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: zone,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
export const chatDayKey = (stamp: string | number | Date) =>
  dayFormat.format(new Date(stamp));
export function chatDayLabel(stamp: string, now: number = Date.now()) {
  const key = chatDayKey(stamp),
    today = chatDayKey(now);
  if (key === today) return "Hoje";
  const date = new Date(`${today}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() - 1);
  if (key === chatDayKey(date)) return "Ontem";
  return labelFormat.format(new Date(stamp));
}
