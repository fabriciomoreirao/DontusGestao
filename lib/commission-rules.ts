export type CommissionScope = "commercial" | "cs" | "lia";
export type ScoreTier = { min: number; max: number; percentage: number };
export type CommissionRule = {
  kind: "commissionRule"; scope: CommissionScope; employeeId: string; employeeName: string;
  product: string; type: "percentage" | "fixed"; value: number; scoreTiers?: ScoreTier[];
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const tokens = (values: unknown) => [...new Set((Array.isArray(values) ? values : [])
  .filter((value): value is string => typeof value === "string").flatMap(value => value.split(","))
  .map(value => normalize(value.trim())).filter(Boolean))];

// Shared with the CS journey: contracted features in use plus additional Plus features.
export function customerSuccessScore(detail: { featuresBase?: unknown; featuresActive?: unknown; featuresPlus?: unknown }, defaultBase: string[] = []) {
  const contracted = tokens(detail.featuresBase);
  const base = contracted.length ? contracted : tokens(defaultBase);
  if (!base.length) return 0;
  const active = new Set(tokens(detail.featuresActive));
  const plus = tokens(detail.featuresPlus).filter(feature => !base.includes(feature));
  return Math.max(0, Math.round((base.filter(feature => active.has(feature)).length + plus.length) / base.length * 100));
}

export function validScoreTiers(tiers: unknown): tiers is ScoreTier[] {
  if (!Array.isArray(tiers) || !tiers.length) return false;
  let cursor = 0;
  for (const tier of tiers) {
    if (!tier || ![tier.min, tier.max, tier.percentage].every(value => typeof value === "number" && Number.isFinite(value)) ||
      tier.min !== cursor || tier.max <= tier.min || tier.max > 100 || tier.percentage < 0 || tier.percentage > 100) return false;
    cursor = tier.max;
  }
  return cursor === 100;
}

export function calculateCommission(rule: CommissionRule, saleCents: number, score: number | null) {
  const currency = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  if (rule.scope === "cs" && rule.scoreTiers) {
    if (!validScoreTiers(rule.scoreTiers) || score === null || !Number.isFinite(score) || score < 0) return null;
    const tier = rule.scoreTiers.find((entry, index) => score >= entry.min && (score < entry.max || index === rule.scoreTiers!.length - 1));
    if (!tier) return null;
    const last = tier.max === 100;
    return { cents: Math.round(Math.max(0, saleCents) * tier.percentage / 100),
      label: `${tier.percentage}% sobre ${currency(saleCents)} · score ${score}% · faixa ${tier.min}% ${last ? "ou mais" : `a menos de ${tier.max}%`}` };
  }
  const cents = rule.type === "percentage" ? Math.round(Math.max(0, saleCents) * rule.value / 100) : Math.round(rule.value * 100);
  return { cents, label: rule.type === "percentage" ? `${rule.value}% sobre ${currency(saleCents)}` : `${currency(cents)} fixos` };
}
