const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-\d{2}$/;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dateKey(value: string | Date): string {
  if (typeof value === "string" && dayPattern.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatter.format(date) : "";
}

export function dateRangeBounds(period: string): { from: string; to: string } {
  if (monthPattern.test(period)) {
    const [year, month] = period.split("-").map(Number);
    if (month < 1 || month > 12) return { from: "", to: "" };
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { from: `${period}-01`, to: `${period}-${last}` };
  }
  const [from = "", to = ""] = period.split("..");
  return {
    from: dayPattern.test(from) ? from : "",
    to: dayPattern.test(to) ? to : "",
  };
}

export function currentDateRange(): string {
  return dateKey(new Date()).slice(0, 7);
}

export function inDateRange(
  value: string | undefined | null,
  period: string,
): boolean {
  const { from, to } = dateRangeBounds(period);
  if (!from && !to) return true;
  if (!value) return false;
  if (monthPattern.test(value)) {
    const month = dateRangeBounds(value);
    return (!from || month.to >= from) && (!to || month.from <= to);
  }
  const date = dateKey(value);
  return Boolean(date && (!from || date >= from) && (!to || date <= to));
}

export function overlapsDateRange(
  start: string,
  end: string,
  period: string,
): boolean {
  const { from, to } = dateRangeBounds(period);
  return (!from || dateKey(end) >= from) && (!to || dateKey(start) <= to);
}

export function dateRangeLabel(period: string): string {
  const { from, to } = dateRangeBounds(period);
  const display = (day: string) => day.split("-").reverse().join("/");
  return from && to
    ? `${display(from)} a ${display(to)}`
    : from
      ? `A partir de ${display(from)}`
      : to
        ? `Até ${display(to)}`
        : "Todos os períodos";
}
