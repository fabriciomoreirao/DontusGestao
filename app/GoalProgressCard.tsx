import { CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Gauge, Target, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { formatGoalValue } from "@/lib/goal-target";
import { goalMetricLabels, type GoalMetric } from "@/lib/goal-progress";

export type GoalCardData = { id: string; title: string; metric: string; cadence: string; target: number; actual: number; progress: number; achieved: boolean; active?: boolean; employee: string; department: string; periodStart: string; periodEnd: string };
const cadence: Record<string, string> = { daily: "Diária", weekly: "Semanal", monthly: "Mensal", annual: "Anual" };
const date = (value: string) => value.split("-").reverse().join("/");

export default function GoalProgressCard({ goal, actions, onOpen }: { goal: GoalCardData; actions?: ReactNode; onOpen?: () => void }) {
  const Icon = goal.metric === "salesValue" ? CircleDollarSign : goal.metric === "usageScore" ? Gauge : Target;
  const percent = Math.max(0, goal.progress);
  const title = <><span className="performance-goal-icon"><Icon size={23} aria-hidden="true"/></span><span><small>{goalMetricLabels[goal.metric as GoalMetric] || "Meta de desempenho"}</small><h2>{goal.title}</h2></span>{onOpen && <ChevronRight size={18} aria-hidden="true"/>}</>;
  return <article data-reminder-entity-id={goal.id} className={`performance-goal-card${goal.achieved ? " achieved" : ""}${goal.active === false ? " inactive" : ""}`}>
    <header><span className="performance-goal-cadence">{cadence[goal.cadence] || goal.cadence}</span><span className="performance-goal-state">{goal.achieved && <CheckCircle2 size={15} aria-hidden="true"/>}{goal.achieved ? "Meta batida" : goal.active === false ? "Encerrada" : "Em acompanhamento"}</span></header>
    {onOpen ? <button type="button" className="performance-goal-title" onClick={onOpen} aria-label={`Ver meta ${goal.title}`}>{title}</button> : <div className="performance-goal-title">{title}</div>}
    <div className="performance-goal-values"><div><small>Realizado</small><strong>{formatGoalValue(goal.actual, goal.metric)}</strong></div><div><small>Objetivo</small><b>{formatGoalValue(goal.target, goal.metric)}</b></div></div>
    <div className="performance-goal-progress-label"><span>Progresso da meta</span><strong>{percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div>
    <div className="performance-goal-track" role="progressbar" aria-label={`Progresso de ${goal.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} aria-valuetext={`${percent.toLocaleString("pt-BR")}% da meta`}><i style={{ width: `${Math.min(100, percent)}%` }}/></div>
    <div className="performance-goal-scope"><UsersRound size={15} aria-hidden="true"/><span>{goal.employee || "Todo o setor"}<small>{goal.department || "Todos os setores"}</small></span></div>
    <footer><span><CalendarDays size={15} aria-hidden="true"/>{date(goal.periodStart)} a {date(goal.periodEnd)}</span>{actions && <div className="performance-goal-actions">{actions}</div>}</footer>
  </article>;
}
