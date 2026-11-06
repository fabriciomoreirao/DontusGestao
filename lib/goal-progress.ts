import { commissionDate, customerSuccessScore } from './commission-rules.ts';
import { commercialIndicatorFlow } from './commercial-indicators.ts';
import { enterpriseHealthScore } from './enterprise-score.ts';

export type GoalMetric = 'salesValue' | 'salesCount' | 'referralCount' | 'usageScore' | 'clientCount';
export type GoalCadence = 'daily' | 'monthly' | 'annual' | 'weekly';
export type PerformanceGoal = { kind: 'performanceGoal'; metric: GoalMetric; cadence: GoalCadence; target: number; employeeId: string; employeeName: string; departmentId: string; departmentName: string; periodStart: string; periodEnd: string; createdBy: string; notes: string; active: boolean };
export type GoalSource = { module: string; record_type: string; owner: string; team: string; status: string; amount_cents: number; description: string; created_at: string; updated_at: string };
export const goalMetricLabels: Record<GoalMetric, string> = { salesValue: 'Valor de vendas', referralCount: 'Quantidade de indicações', usageScore: 'Médias de score', salesCount: 'Quantidade de vendas', clientCount: 'Quantidade de clientes (legado)' };
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function goalDetail(raw: string): Record<string, unknown> { try { const value = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } }
export function parsePerformanceGoal(raw: string): PerformanceGoal | null { const value = goalDetail(raw); return value.kind === 'performanceGoal' ? value as PerformanceGoal : null; }
export function goalPeriod(start: string, cadence: GoalCadence) {
  const date = new Date(`${start}T12:00:00Z`);
  if (cadence === 'annual') return { start, end: `${start.slice(0,4)}-12-31` };
  if (cadence === 'monthly') return { start, end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 0, 12)).toISOString().slice(0,10) };
  if (cadence === 'weekly') { date.setUTCDate(date.getUTCDate()+6); return { start, end: date.toISOString().slice(0,10) }; }
  return { start, end: start };
}
export function goalProgress(goal: PerformanceGoal, items: GoalSource[], defaultFeatures: string[] = []) {
  const source = items.filter(item => {
    const detail = goalDetail(item.description);
    const commercial = item.module === 'commercial';
    const owner = commercial ? detail.seller || item.owner : item.module === 'referrals' ? detail.senderName || item.owner : item.owner;
    const sector = item.module === 'referrals' ? detail.senderDepartment || item.team : item.team;
    if (goal.employeeName && normalize(owner) !== normalize(goal.employeeName)) return false;
    const department = normalize(goal.departmentName), team = normalize(sector);
    if (department && team !== department && !team.startsWith(`${department} ·`) && !team.startsWith(`${department} -`)) return false;
    const raw = commercial ? detail.wonAt || detail.closedAt || detail.saleDate || (/ganho|fechad|vendid/.test(normalize(item.status)) ? item.updated_at : detail.entryDate || item.created_at)
      : item.module === 'referrals' ? detail.date || item.created_at : detail.trackingStartedAt || detail.startDate || item.created_at;
    const day = commissionDate(raw);
    return !!day && day >= goal.periodStart && day <= goal.periodEnd;
  });
  const sales = source.filter(item => item.module === 'commercial' && commercialIndicatorFlow(item) === 'crm' && goalDetail(item.description).kind !== 'directSale' && /ganho|fechad|vendid/.test(normalize(`${item.status} ${goalDetail(item.description).stage || ''}`)));
  if (goal.metric === 'salesValue') return sales.reduce((sum,item) => sum + item.amount_cents / 100, 0);
  if (goal.metric === 'salesCount') return sales.length;
  if (goal.metric === 'referralCount') return source.filter(item => item.module === 'referrals' && goalDetail(item.description).kind === 'referral').length;
  if (goal.metric === 'clientCount') return source.filter(item => ['cs','lia'].includes(item.module)).length;
  const scores = source.filter(item => ['cs','lia'].includes(item.module)).map(item => {
    const detail = goalDetail(item.description);
    if (detail.kind === 'csJourney') return customerSuccessScore(detail, defaultFeatures);
    if (detail.kind === 'enterpriseNetwork' && Array.isArray(detail.units)) return enterpriseHealthScore(detail.units);
    return typeof detail.score === 'number' && Number.isFinite(detail.score) ? detail.score : null;
  }).filter((score): score is number => score !== null);
  return scores.length ? Math.round(scores.reduce((sum,score) => sum + score, 0) / scores.length * 100) / 100 : 0;
}
