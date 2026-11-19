"use client";
import {
  parsePerformanceGoal,
  goalFunnelName,
  type PerformanceGoal,
} from "@/lib/goal-progress";
import GoalProgressCard from "@/app/GoalProgressCard";
import { useGoalProgress } from "@/app/useGoalProgress";

type Item = {
  id: string;
  module: string;
  title: string;
  description?: string;
  version?: number;
};
type Catalog = {
  id?: string;
  name: string;
  catalog: string;
  description: string;
  active?: boolean;
};
export default function CommercialGoalSummary({
  items,
  catalogs,
  start,
  end,
  seller,
  funnel,
}: {
  items: Item[];
  catalogs: Catalog[];
  start: string;
  end: string;
  seller: string;
  funnel: string;
}) {
  const configured = catalogs.map((entry) => ({
    ...entry,
    id: entry.id || "",
    active: entry.active !== false,
  }));
  const goals = items.flatMap((item) => {
    const goal =
      item.module === "goals"
        ? parsePerformanceGoal(item.description || "")
        : null;
    if (
      !goal ||
      !goal.active ||
      !["salesValue", "salesCount"].includes(goal.metric) ||
      goal.periodStart > end ||
      goal.periodEnd < start
    )
      return [];
    if (
      (goal.departmentName && !/comercial/i.test(goal.departmentName)) ||
      (seller !== "all" && goal.employeeName && goal.employeeName !== seller)
    )
      return [];
    const names = goalFunnelName(goal, configured);
    if (funnel !== "all" && names && !names.split(", ").includes(funnel))
      return [];
    return [{ item, goal }];
  });
  return goals.length ? (
    <GoalCards goals={goals} items={items} catalogs={configured} />
  ) : null;
}
function GoalCards({
  goals,
  items,
  catalogs,
}: {
  goals: { item: Item; goal: PerformanceGoal }[];
  items: Item[];
  catalogs: {
    id: string;
    name: string;
    catalog: string;
    description: string;
    active: boolean;
  }[];
}) {
  const { results, error } = useGoalProgress(
    items.map((item) => ({
      id: item.id,
      module: item.module,
      version: item.version || 1,
    })),
  );
  return (
    <section className="commercial-goal-summary">
      <h2>Metas com vigência no período</h2>
      <p>
        O realizado considera toda a vigência de cada meta, indicada no cartão.
      </p>
      {error && <p role="alert">{error}</p>}
      <div>
        {goals.map(({ item, goal }) => {
          const actual = results.find(
            (result) => result.id === item.id,
          )?.actual;
          const progress =
            goal.target > 0 ? ((actual || 0) / goal.target) * 100 : 0;
          return (
            <GoalProgressCard
              key={item.id}
              pending={actual === undefined}
              goal={{
                id: item.id,
                title: item.title,
                metric: goal.metric,
                cadence: goal.cadence,
                target: goal.target,
                actual: actual || 0,
                progress,
                achieved: progress >= 100,
                active: goal.active,
                employee: goal.employeeName,
                department: goal.departmentName,
                periodStart: goal.periodStart,
                periodEnd: goal.periodEnd,
                funnelName: goalFunnelName(goal, catalogs),
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
