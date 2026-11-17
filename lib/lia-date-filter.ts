type LiaDateItem = { status: string; created_at: string; updated_at: string; description: string };
type LiaDates = { startDate?: string; completedAt?: string; history?: Array<{ at?: string; text?: string }> };

export function liaCalendarDate(value?: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function liaDateFilterError(start: string, end: string): string {
  if (start && !liaCalendarDate(start) || end && !liaCalendarDate(end)) return "Informe uma data válida.";
  return start && end && start > end ? "A data final deve ser igual ou posterior à data inicial." : "";
}

export function matchesLiaDates(item: LiaDateItem, start: string, end: string): boolean {
  if (liaDateFilterError(start, end)) return false;
  let detail: LiaDates = {};
  try { detail = JSON.parse(item.description) ?? {}; } catch { /* Registros legados usam a data de criação. */ }
  const added = liaCalendarDate(detail.startDate) || liaCalendarDate(item.created_at);
  if (start && (!added || added < start)) return false;
  if (!end) return true;
  if (item.status !== "Concluida") return false;
  const history = Array.isArray(detail.history) ? detail.history : [];
  const completion = [...history].reverse().find(entry => /acompanhamento concluído|para Concluida\.|concluído importado/i.test(entry.text ?? ""));
  const completed = liaCalendarDate(detail.completedAt) || liaCalendarDate(completion?.at) || liaCalendarDate(item.updated_at);
  return Boolean(completed && completed <= end);
}
