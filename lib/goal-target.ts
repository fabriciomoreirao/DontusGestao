export type GoalTargetKind = "money" | "percentage" | "integer";
export const goalTargetKind = (metric: string): GoalTargetKind => metric === "salesValue" ? "money" : metric === "usageScore" ? "percentage" : "integer";
export function formatGoalValue(value: number, metric: string) {
  const kind = goalTargetKind(metric);
  return kind === "money" ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: kind === "integer" ? 0 : 2 })}${kind === "percentage" ? "%" : ""}`;
}
export function parseGoalTarget(raw: string, metric = "salesValue"): number {
  const cleaned = raw.trim().replace(/R\$|%|\s/g, "");
  if (!/^(?:\d+(?:[.,]\d+)*|[.,]\d+)$/.test(cleaned)) return NaN;
  if (goalTargetKind(metric) === "integer" && /^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ""));
  return Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned);
}
export function goalTargetError(value: number, metric: string): string {
  if (!Number.isFinite(value) || value <= 0) return "Informe uma meta maior que zero.";
  const kind = goalTargetKind(metric);
  if (kind === "integer" && !Number.isSafeInteger(value)) return "Informe uma quantidade em número inteiro.";
  if (kind === "percentage" && value > 100) return "A meta de score deve estar entre 0,01% e 100%.";
  if (kind !== "integer" && Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) return "Use no máximo duas casas decimais.";
  return "";
}
