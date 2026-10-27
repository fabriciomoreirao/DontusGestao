export const analyticsPalette = ["#2563eb", "#0d9488", "#7c3aed", "#d97706", "#e11d48", "#0891b2", "#64748b"];
export function percentageChange(current: number, previous: number) {
  return previous > 0 ? Math.round((current - previous) / previous * 100) : current === 0 ? 0 : null;
}
export function chartScale(values: number[]) {
  const maximum = Math.max(1, ...values.filter(Number.isFinite).map(value => Math.max(0, value)));
  const raw = maximum / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find(value => value >= raw / power) ?? 10) * power);
  const ceiling = Math.ceil(maximum / step) * step;
  return { maximum: ceiling, ticks: Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step) };
}
export function distributionEntries(entries: Array<{ label: string; count: number }>, limit = 8) {
  const sorted = entries.filter(entry => Number.isFinite(entry.count) && entry.count > 0).slice().sort((a, b) => b.count - a.count);
  const visible = sorted.slice(0, limit);
  const others = sorted.slice(limit).reduce((sum, entry) => sum + entry.count, 0);
  if (others) {
    const existing = visible.find(entry => entry.label === "Outros");
    if (existing) return visible.map(entry => entry === existing ? { ...entry, count: entry.count + others } : entry);
    return [...visible, { label: "Outros", count: others }];
  }
  return visible;
}
export function analyticsColor(label: string, index: number) {
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/reprov|cancel|perdid|sem sucesso|sem retorno/.test(normalized)) return "#e11d48";
  if (/penden|aguard|espera|valid/.test(normalized)) return "#d97706";
  if (/conclu|finaliz|ganho|sucesso|aprov|resolvid/.test(normalized)) return "#0d9488";
  if (/andamento|progress|process|onboarding/.test(normalized)) return "#2563eb";
  return analyticsPalette[index % analyticsPalette.length];
}

export function isCompletedAnalyticsStatus(value: unknown) {
  const status = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return !/sem sucesso|sem retorno|falta de retorno|reprov|cancel|aguard|penden|em aprova/.test(status) &&
    /conclu|finaliz|aprov|ganho|feito|resolvid|contrat|liberad|sucesso/.test(status);
}
