export type CommissionScope = "commercial" | "cs" | "lia";
export type ScoreTier = { min: number; max: number | null; percentage: number };
export type CommissionRule = {
  kind: "commissionRule"; scope: CommissionScope; employeeId: string; employeeName: string;
  product: string; type: "percentage" | "fixed"; value: number; scoreTiers?: ScoreTier[];
};

export const normalizeCommissionName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
const normalize = normalizeCommissionName;

export function parseCommissionRule(raw: string): CommissionRule | null {
  try {
    const value = JSON.parse(raw);
    if (!value || value.kind && value.kind !== "commissionRule" || !["commercial", "cs", "lia"].includes(value.scope)
      || !["percentage", "fixed"].includes(value.type) || !Number.isFinite(Number(value.value ?? 0))) return null;
    return {...value, kind: "commissionRule", employeeId: String(value.employeeId || "").trim(),
      employeeName: String(value.employeeName || "").trim(), product: String(value.product || "*").trim(), value: Number(value.value ?? 0)};
  } catch { return null; }
}

export function findCommissionRule(rules: CommissionRule[], row: {scope: CommissionScope; employeeId: string; employeeName: string; product: string}) {
  const candidates = rules.filter(rule => rule.scope === row.scope && (rule.employeeId && row.employeeId
    ? rule.employeeId.toLowerCase() === row.employeeId.toLowerCase() : normalize(rule.employeeName) === normalize(row.employeeName)));
  return candidates.find(rule => normalize(rule.product) === normalize(row.product))
    ?? candidates.find(rule => rule.product === "*") ?? (row.scope === "cs" ? candidates[0] : undefined);
}

export function commissionDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const day = new Date(`${value.slice(0,10)}T12:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== value.slice(0,10)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value ? value : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(parsed) : null;
}

export function journeyCommissionDate(scope: "cs" | "lia", detail: Record<string, unknown>, createdAt: string): string | null {
  if (scope === "lia") return detail.startDate ? commissionDate(detail.startDate) : detail.startedAt ? commissionDate(detail.startedAt) : null;
  if (["validation", "onboarding", "activation"].includes(String(detail.phase))) return null;
  return detail.trackingStartedAt ? commissionDate(detail.trackingStartedAt)
    : ["tracking", "evolution"].includes(String(detail.phase)) ? commissionDate(detail.startDate) : null;
}
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
  if(tiers.length===4&&tiers[3]?.max===null)return tiers.every((tier,index)=>tier&&tier.min===[0,50,75,100][index]&&tier.max===[50,75,100,null][index]&&typeof tier.percentage==="number"&&Number.isFinite(tier.percentage)&&tier.percentage>=0&&tier.percentage<=100)&&(tiers[0].percentage===0);
  let cursor = 0;
  for (const tier of tiers) {
    if (!tier || ![tier.min, tier.max, tier.percentage].every(value => typeof value === "number" && Number.isFinite(value)) ||
      tier.min !== cursor || tier.max <= tier.min || tier.max > 100 || tier.percentage < 0 || tier.percentage > 100) return false;
    cursor = tier.max;
  }
  return cursor === 100 && tiers.length === 3;
}

export function commissionScoreTiers(tiers:ScoreTier[]):ScoreTier[]{
  if(tiers.length===4&&tiers[3]?.max===null)return tiers;
  return [{min:0,max:50,percentage:0},{min:50,max:75,percentage:tiers[0]?.percentage??5},{min:75,max:100,percentage:tiers[1]?.percentage??10},{min:100,max:null,percentage:tiers[2]?.percentage??15}];
}

export function calculateCommission(rule: CommissionRule, saleCents: number, score: number | null) {
  const currency = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  if (rule.scope === "cs" && rule.scoreTiers) {
    if (!validScoreTiers(rule.scoreTiers) || score === null || !Number.isFinite(score) || score < 0) return null;
    const tiers=commissionScoreTiers(rule.scoreTiers);
    const tier = tiers.find(entry => entry.max===null?score>entry.min:score>=entry.min&&(entry.max===100?score<=100:score<entry.max));
    if (!tier) return null;
    const range=tier.max===null?"acima de 100%":tier.max===100?"75% a 100% (inclusive)":tier.min===0?"abaixo de 50%":`${tier.min}% a menos de ${tier.max}%`;
    return { cents: Math.round(Math.max(0, saleCents) * tier.percentage / 100),
      label: `${tier.percentage}% sobre ${currency(saleCents)} · score ${score}% · faixa ${range}` };
  }
  const cents = rule.type === "percentage" ? Math.round(Math.max(0, saleCents) * rule.value / 100) : Math.round(rule.value * 100);
  return { cents, label: rule.type === "percentage" ? `${rule.value}% sobre ${currency(saleCents)}` : `${currency(cents)} fixos` };
}
