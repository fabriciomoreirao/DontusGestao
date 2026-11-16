"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Target, TrendingUp } from "lucide-react";
import { goalChartData, type ChartGoal } from "@/lib/goal-charts";
import { formatGoalValue } from "@/lib/goal-target";

const date = (value: string) => value.split("-").reverse().join("/");
const shortDate = (value: string) => value.slice(5).split("-").reverse().join("/");
const percentage = (goal: ChartGoal) => goal.target > 0 ? goal.actual / goal.target * 100 : 0;
const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const remaining = (goal: ChartGoal, value: number) => goal.metric === "usageScore"
  ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.` : formatGoalValue(value, goal.metric);

export default function PublicGoalCharts({ goals }: { goals: ChartGoal[] }) {
  const [selected, setSelected] = useState(goals[0]?.id ?? "");
  const goal = goals.find(entry => entry.id === selected) ?? goals[0];
  if (!goal) return null;
  const achieved = goals.filter(entry => entry.achieved).length;
  const average = goals.reduce((sum, entry) => sum + Math.min(100, percentage(entry)), 0) / goals.length;
  return <>
    <section className="public-goal-summary" aria-label="Resumo das metas">
      <article><Target/><span><small>Metas acompanhadas</small><strong>{goals.length}</strong></span></article>
      <article><CheckCircle2/><span><small>Metas atingidas</small><strong>{achieved}</strong></span></article>
      <article><TrendingUp/><span><small>Avanço médio até o objetivo</small><strong>{percent(average)}</strong></span></article>
      <article><BarChart3/><span><small>Metas em aberto</small><strong>{goals.length - achieved}</strong></span></article>
    </section>
    <section className="public-goal-charts">
      <GoalEvolution key={goal.id} goal={goal} selector={<label className="public-goal-selector">Meta acompanhada<select value={goal.id} onChange={event => setSelected(event.target.value)}>{goals.map(entry => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label>}/>
      <article className="public-ops-panel public-goal-comparison"><header><div><h2><BarChart3 size={19}/>Distância até o objetivo</h2><p>Realizado e saldo de cada meta</p></div></header>
        <div className="public-goal-comparison-rows">{goals.map(entry => <div className="public-goal-comparison-row" key={entry.id}>
          <button type="button" aria-pressed={goal.id === entry.id} onClick={() => setSelected(entry.id)}><strong>{entry.title}</strong><b>{percent(percentage(entry))}</b></button>
          <div className="public-goal-bullet" role="meter" aria-label={`Atingimento de ${entry.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, percentage(entry)))} aria-valuetext={`${percent(percentage(entry))}, realizado ${formatGoalValue(entry.actual, entry.metric)}, objetivo ${formatGoalValue(entry.target, entry.metric)}`}><i style={{width:`${Math.max(0, Math.min(100, percentage(entry)))}%`}}/><em title="Objetivo: 100%"/></div>
          <span><small>{formatGoalValue(entry.actual, entry.metric)} de {formatGoalValue(entry.target, entry.metric)}</small><small>{entry.achieved ? "Objetivo atingido" : `Faltam ${remaining(entry, Math.max(0, entry.target - entry.actual))}`}</small></span>
        </div>)}</div>
      </article>
    </section>
  </>;
}

function GoalEvolution({ goal, selector }: { goal: ChartGoal; selector: React.ReactNode }) {
  const chart = goalChartData(goal);
  const [index, setIndex] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(260, Math.round(entries[0].contentRect.width))));
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, []);
  const point = chart.history[Math.min(index ?? chart.history.length - 1, chart.history.length - 1)];
  const height = 250, left = 76, right = 20, top = 20, bottom = 32;
  const x = (value: string) => left + chart.x(value) * (width - left - right);
  const y = (value: number) => height - bottom - value / chart.max * (height - top - bottom);
  const points = chart.history.map(entry => `${x(entry.date)},${y(entry.actual)}`).join(" ");
  const compact = (value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1, ...(goal.metric === "salesValue" ? { style: "currency", currency: "BRL" } : {}) }).format(value) + (goal.metric === "usageScore" ? "%" : "");
  const ticks = [0, chart.max / 3, chart.max * 2 / 3, chart.max];
  return <article className="public-ops-panel public-goal-evolution"><header><div><h2><TrendingUp size={19}/>Evolução até a meta</h2><p>{date(goal.periodStart)} a {date(goal.periodEnd)}</p></div>{selector}</header>
    <div className="public-goal-chart-legend"><span className="actual">Realizado acumulado</span><span className="pace">Ritmo para atingir</span><span className="target">Objetivo</span></div>
    <svg ref={svg} className="public-goal-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evolução de ${goal.title}: realizado ${formatGoalValue(goal.actual, goal.metric)}, objetivo ${formatGoalValue(goal.target, goal.metric)}`} onPointerMove={event => {
      if (!chart.history.length) return;
      const rect = event.currentTarget.getBoundingClientRect();const position = (event.clientX - rect.left) / rect.width * width;
      setIndex(chart.history.reduce((best, entry, candidate) => Math.abs(x(entry.date) - position) < Math.abs(x(chart.history[best].date) - position) ? candidate : best, 0));
    }} onPointerLeave={() => setIndex(null)}>
      <title>Realizado acumulado, ritmo para atingir e linha do objetivo</title>
      {ticks.map(tick => <g key={tick} className="public-goal-grid"><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text x={left-10} y={y(tick)+4} textAnchor="end">{compact(tick)}</text></g>)}
      <line className="public-goal-target-line" x1={left} x2={width-right} y1={y(goal.target)} y2={y(goal.target)}/>
      <line className="public-goal-pace-line" x1={x(goal.periodStart)} x2={x(goal.periodEnd)} y1={y(chart.expected(goal.periodStart))} y2={y(goal.target)}/>
      {chart.history.length > 1 && <><polygon className="public-goal-area" points={`${x(chart.history[0].date)},${y(0)} ${points} ${x(chart.history.at(-1)!.date)},${y(0)}`}/><polyline className="public-goal-actual-line" points={points}/></>}
      {point && <g className="public-goal-selected-point"><line x1={x(point.date)} x2={x(point.date)} y1={top} y2={height-bottom}/><circle cx={x(point.date)} cy={y(point.actual)} r={5}/></g>}
      <text x={left} y={height-7}>{shortDate(goal.periodStart)}</text><text x={width-right} y={height-7} textAnchor="end">{shortDate(goal.periodEnd)}</text>
    </svg>
    {point ? <div className="public-goal-point-detail"><label>Consultar dia<input type="range" min={0} max={Math.max(0, chart.history.length-1)} value={index ?? chart.history.length-1} onChange={event => setIndex(Number(event.target.value))} aria-label={`Dia da evolução de ${goal.title}`} aria-valuetext={`${date(point.date)}: ${formatGoalValue(point.actual, goal.metric)}`}/></label><output>{shortDate(point.date)} · <strong>{formatGoalValue(point.actual, goal.metric)}</strong></output></div> : <p className="public-goal-history-empty">{goal.history ? "A meta ainda não começou." : "O histórico de evolução está sendo atualizado."}</p>}
    <footer><span><small>{goal.achieved ? "Objetivo atingido" : "Falta para atingir"}</small><strong>{goal.achieved ? formatGoalValue(goal.actual, goal.metric) : remaining(goal, chart.remaining)}</strong></span><span>{chart.achievedOn ? `Atingida em ${date(chart.achievedOn)}` : `Objetivo: ${formatGoalValue(goal.target, goal.metric)}`}</span></footer>
  </article>;
}
