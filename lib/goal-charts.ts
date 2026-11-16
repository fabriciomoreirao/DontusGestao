export type GoalHistoryPoint = { date: string; actual: number };
export type ChartGoal = { id: string; title: string; metric: string; target: number; actual: number; progress: number; achieved: boolean; periodStart: string; periodEnd: string; history?: GoalHistoryPoint[] };
const day = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T12:00:00Z`) / 86_400_000 : NaN;

export function goalChartData(goal: ChartGoal) {
  const start = day(goal.periodStart), end = day(goal.periodEnd);
  const history = (goal.history ?? []).filter(point => Number.isFinite(point.actual) && day(point.date) >= start && day(point.date) <= end).sort((a, b) => a.date.localeCompare(b.date));
  const span = Math.max(0, end - start);
  const max = Math.max(1, goal.target, goal.actual, ...history.map(point => point.actual)) * 1.12;
  const x = (date: string) => span ? Math.max(0, Math.min(1, (day(date) - start) / span)) : 0.5;
  const expected = (date: string) => goal.target * Math.max(0, Math.min(1, (day(date) - start + 1) / (span + 1)));
  return { history, max, x, expected, remaining: Math.max(0, goal.target - goal.actual),
    achievedOn: goal.actual >= goal.target && goal.target > 0 ? history.find(point => point.actual >= goal.target)?.date : undefined };
}
