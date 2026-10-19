"use client";

import {
  Activity, BadgeCheck, BarChart3, BriefcaseBusiness, CalendarDays, CheckCircle2,
  Database, Headphones, Home, Moon, Sun, ListTodo, Pause, Play, Radio, RefreshCw, Sparkles, Star, Target, TrendingUp, Trophy, UsersRound, WalletCards,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

type PublicCollaborator = { id: string; name: string; role: string; photo: string; solutions: number };
type PublicRanking = { name: string; count: number; department?: string; photo?: string };
type PublicDay = { date: string; commitments: number; tasks: number; attendances: number; referrals?: number; sales: number; followUps: number; lia: number };
type PublicSeller = { name: string; sales: number; revenueCents: number; opportunities: number };
type PublicCommercial = {
  enabled: boolean; leads: number; opportunities: number; sales: number; directSales: number; revenueCents: number;
  pipelineCents: number; conversionRate: number; valueGoalCents: number; salesGoal: number; valueProgress: number;
  salesProgress: number; topSellers: PublicSeller[];
};
type PublicDepartment = {
  id: string; name: string; commitments: number; upcomingCommitments: number; tasks: number; activeTasks: number;
  completedTasks: number; attendances: number; solvedAttendances: number; followUps: number; completedFollowUps: number;
  liaFollowUps: number; completedLiaFollowUps: number; collaborators: number;
  sources: { agenda: boolean; tasks: boolean; support: boolean; commercial: boolean; followUp: boolean; lia: boolean };
  goals: { salesValueCents: number; salesCount: number; trackingCount: number; trackingActual: number; trackingProgress: number };
  topCollaborators: PublicCollaborator[]; activityByDay: PublicDay[]; commercial: PublicCommercial;
};
type PublicOverviewData = {
  generatedAt: string; month: string; monthLabel: string; refreshAfterSeconds: number;
  overview: {
    departments: number; commitments: number; tasks: number; activeTasks: number; completedTasks: number;
    attendances: number; solvedAttendances: number; followUps: number; completedFollowUps: number; liaFollowUps: number;
    completedLiaFollowUps: number; collaborators: number; topAttendances: PublicRanking[]; activityByDay: PublicDay[];
    goals: { salesValueCents: number; salesValueActualCents: number; salesValueProgress: number; salesCount: number; salesActual: number; salesProgress: number; trackingCount: number; trackingActual: number; trackingProgress: number };
  };
  departments: PublicDepartment[];
  referrals: {
    total: number; forwarded: number; hired: number; configured: number; approved: number;
    topSenders: PublicRanking[]; modules: PublicRanking[]; sectors: PublicRanking[];
  };
};

type Series = { key: keyof PublicDay; label: string; color: string };

const percentage = (value: number, total: number) => total ? Math.round(value / total * 100) : 0;
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);
const monthNow = () => new Date().toLocaleDateString("en-CA").slice(0, 7);
const ROTATION_SECONDS = 5 * 60;
const ROTATION_LABEL = "5 min";

export default function PublicOperationsOverview() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const saved = window.localStorage.getItem("dontus.public-bi-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  const chooseTheme = (value: "light" | "dark") => { setTheme(value); window.localStorage.setItem("dontus.public-bi-theme", value); };
  const [data, setData] = useState<PublicOverviewData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [month, setMonth] = useState(monthNow);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationProgress, setRotationProgress] = useState(0);
  const [clock, setClock] = useState(Date.now());

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const response = await fetch(`/api/public-overview?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Não foi possível carregar o painel.");
      setData(body); setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Painel indisponível.");
    } finally {
      setRefreshing(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => void load(true), 15_000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1_000);
    const refreshOnFocus = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => { window.clearInterval(refreshTimer); window.clearInterval(clockTimer); document.removeEventListener("visibilitychange", refreshOnFocus); };
  }, [load]);

  const tabIds = useMemo(() => ["overview", ...(data?.departments.map((entry) => entry.id) ?? []), "referrals"], [data]);
  const tabKey = tabIds.join("|");
  useEffect(() => {
    if (!autoRotate || tabIds.length < 2) { setRotationProgress(0); return; }
    setRotationProgress(0);
    let elapsed = 0;
    const timer = window.setInterval(() => {
      elapsed += 1;
      setRotationProgress(Math.min(100, elapsed / ROTATION_SECONDS * 100));
      if (elapsed >= ROTATION_SECONDS) {
        setTab((current) => tabIds[(Math.max(0, tabIds.indexOf(current)) + 1) % tabIds.length]);
        elapsed = 0; setRotationProgress(0);
      }
    }, 1_000);
    return () => window.clearInterval(timer);
    // tabKey keeps the rotation stable while fresh data replaces the object.
  }, [autoRotate, tabKey]);

  const chooseTab = (next: string) => { setTab(next); setRotationProgress(0); };
  const department = data?.departments.find((entry) => entry.id === tab);
  const maxDepartmentVolume = useMemo(() => Math.max(1, ...(data?.departments.map((entry) => entry.tasks + entry.attendances + entry.commitments + entry.followUps + entry.liaFollowUps + entry.commercial.sales) ?? [1])), [data]);
  const secondsSinceUpdate = data ? Math.max(0, Math.floor((clock - new Date(data.generatedAt).getTime()) / 1_000)) : 0;

  if (error && !data) return <main className="public-ops-state"><Image src="/dontus-logo.png" alt="Dontus" width={190} height={54} unoptimized /><h1>Painel indisponível</h1><p>{error}</p><button onClick={() => void load()}><RefreshCw />Tentar novamente</button></main>;
  if (!data) return <main className="public-ops-state"><Image src="/dontus-logo.png" alt="Dontus" width={190} height={54} unoptimized /><RefreshCw className="spin" /><p>Sincronizando indicadores...</p></main>;

  const completionRate = percentage(data.overview.completedTasks, data.overview.tasks);
  const solutionRate = percentage(data.overview.solvedAttendances, data.overview.attendances);
  return <main className={`public-ops-page public-bi-page public-bi-${theme}`}>
    <header className="public-ops-header public-bi-header">
      <Image src="/dontus-logo.png" alt="Dontus Gestão Odontológica" width={158} height={46} unoptimized />
      <span><small>COMMAND CENTER – OPERAÇÕES</small><h1>Dontus BI em tempo real</h1><p>Dados que impulsionam o crescimento da sua clínica</p></span>
      <div className="public-bi-controls">
        <div className="public-bi-theme-switch" role="group" aria-label="Tema do BI público"><button type="button" aria-pressed={theme === "light"} onClick={() => chooseTheme("light")}><Sun size={16}/>Claro</button><button type="button" aria-pressed={theme === "dark"} onClick={() => chooseTheme("dark")}><Moon size={16}/>Escuro</button></div>
        <label><CalendarDays /><span>Competência</span><input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setTab("overview"); }} /></label>
        <button className={autoRotate ? "active" : ""} onClick={() => setAutoRotate((current) => !current)}>{autoRotate ? <Pause /> : <Play />}<span>{autoRotate ? "Pausar rotação" : "Retomar rotação"}</span></button>
        <button onClick={() => void load()} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""} /><span>Atualizar</span></button>
        <b><Radio /><span>AO VIVO<small>{secondsSinceUpdate < 5 ? "agora" : `há ${secondsSinceUpdate}s`}</small></span></b>
      </div>
    </header>

    <nav className="public-ops-tabs public-bi-tabs" aria-label="Setores e indicadores">
      <button className={tab === "overview" ? "active" : ""} onClick={() => chooseTab("overview")}><Home />Visão geral</button>
      {data.departments.map((entry) => <button className={tab === entry.id ? "active" : ""} onClick={() => chooseTab(entry.id)} key={entry.id}><DepartmentTabIcon name={entry.name} />{entry.name}</button>)}
      <button className={tab === "referrals" ? "active referral" : "referral"} onClick={() => chooseTab("referrals")}><BarChart3 />Indicações</button>
      {autoRotate && <i className="public-bi-rotation"><b style={{ width: `${rotationProgress}%` }} /></i>}
    </nav>

    <section className={`public-bi-stage ${tab === "overview" ? "overview-stage" : tab === "referrals" ? "referrals-stage" : department?.commercial.enabled ? "department-stage commercial-stage" : "department-stage"}`} key={tab}>
      {tab === "overview" && <OverviewView data={data} completionRate={completionRate} solutionRate={solutionRate} maxDepartmentVolume={maxDepartmentVolume} onDepartment={chooseTab} />}
      {department && <DepartmentView department={department} />}
      {tab === "referrals" && <ReferralsView referrals={data.referrals} activity={data.overview.activityByDay} />}
    </section>
    <footer className="public-ops-footer"><span><RefreshCw />Atualização automática a cada {data.refreshAfterSeconds}s</span><span><Activity />Rotação entre telas a cada {ROTATION_LABEL}</span><span><BadgeCheck />Valores de comissão não são exibidos</span></footer>
  </main>;
}

function OverviewView({ data, completionRate, solutionRate, maxDepartmentVolume, onDepartment }: { data: PublicOverviewData; completionRate: number; solutionRate: number; maxDepartmentVolume: number; onDepartment: (id: string) => void }) {
  return <>
    <section className="public-ops-kpis public-bi-kpis public-overview-kpis"><Metric tone="blue" icon={<BriefcaseBusiness />} label="Setores ativos" value={data.overview.departments} note="estrutura vinculada" /><Metric tone="violet" icon={<CalendarDays />} label="Compromissos" value={data.overview.commitments} note="na competência" /><Metric tone="teal" icon={<ListTodo />} label="Tarefas" value={data.overview.tasks} note={`${data.overview.activeTasks} em andamento`} /><Metric tone="cyan" icon={<Headphones />} label="Atendimentos" value={data.overview.attendances} note={`${solutionRate}% solucionados`} /><Metric tone="amber" icon={<Target />} label="Meta de vendas" value={`${data.overview.goals.salesActual}/${data.overview.goals.salesCount || "—"}`} note={data.overview.goals.salesCount ? `${data.overview.goals.salesProgress}% atingido` : "sem meta cadastrada"} /><Metric tone="purple" icon={<Activity />} label="Acompanhamentos" value={data.overview.goals.trackingActual} note={data.overview.goals.trackingCount ? `${data.overview.goals.trackingProgress}% da meta` : `${data.overview.followUps} CS · ${data.overview.liaFollowUps} LIA`} /><Metric tone="gold" icon={<WalletCards />} label="Receita / meta" value={money(data.overview.goals.salesValueActualCents)} note={data.overview.goals.salesValueCents ? `${data.overview.goals.salesValueProgress}% de ${money(data.overview.goals.salesValueCents)}` : "sem meta de receita"} /><Metric tone="sky" icon={<UsersRound />} label="Colaboradores" value={data.overview.collaborators} note="ativos nos setores" /></section>
    <section className="public-bi-main-grid">
      <ActivityChart title="Pulso operacional diário" subtitle="Volume de movimentações no mês" days={data.overview.activityByDay} series={[{ key: "commitments", label: "Agenda", color: "#2f7cf6" }, { key: "tasks", label: "Tarefas", color: "#8b5cf6" }, { key: "attendances", label: "Atendimentos", color: "#12b8a6" }, { key: "followUps", label: "Acompanhamentos", color: "#f59e0b" }]} />
      <article className="public-ops-panel public-ops-progress-panel public-bi-efficiency"><header><span><BadgeCheck />Eficiência operacional</span></header><ProgressRow icon={<CheckCircle2 />} label="Conclusão de tarefas" value={completionRate} detail={`${data.overview.completedTasks} de ${data.overview.tasks}`} /><ProgressRow icon={<Headphones />} label="Solução de atendimentos" value={solutionRate} detail={`${data.overview.solvedAttendances} de ${data.overview.attendances}`} /><ProgressRow icon={<TrendingUp />} label="Indicações encaminhadas" value={percentage(data.referrals.forwarded, data.referrals.total)} detail={`${data.referrals.forwarded} de ${data.referrals.total}`} /></article>
    </section>
    <section className="public-bi-bottom-grid">
      <article className="public-ops-panel public-department-volume"><header><span><BarChart3 />Movimentação por setor</span><small>Somente fontes alimentadas na competência</small></header><div style={{ gridTemplateRows: `repeat(${Math.max(1, data.departments.length)}, minmax(0, 1fr))` }}>{data.departments.map((entry) => { const total = entry.tasks + entry.attendances + entry.commitments + entry.followUps + entry.liaFollowUps + entry.commercial.sales; return <button key={entry.id} onClick={() => onDepartment(entry.id)}><span><strong>{entry.name}</strong><small>{entry.collaborators} colaborador(es)</small></span><i><b style={{ width: `${total / maxDepartmentVolume * 100}%` }} /></i><em>{total}</em></button>; })}</div></article>
      <TalentRadar attendances={data.overview.topAttendances} referrals={data.referrals.topSenders} />
    </section>
  </>;
}

function DepartmentTabIcon({ name }: { name: string }) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  if (/comercial/.test(normalized)) return <BarChart3 />;
  if (/desenvolvimento|tecnologia|ti/.test(normalized)) return <TrendingUp />;
  if (/financeiro/.test(normalized)) return <Database />;
  if (/lia/.test(normalized)) return <UsersRound />;
  if (/sucesso|cliente/.test(normalized)) return <Target />;
  if (/suporte|atendimento/.test(normalized)) return <Headphones />;
  return <BriefcaseBusiness />;
}

function Metric({ icon, label, value, note, tone = "blue" }: { icon: React.ReactNode; label: string; value: number | string; note: string; tone?: string }) {
  return <article className={`tone-${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>;
}

function ProgressRow({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: number; detail: string }) {
  return <div className="public-progress-row"><b className="public-progress-icon">{icon}</b><span><strong>{label}</strong><small>{detail}</small></span><i><b style={{ width: `${Math.min(100, value)}%` }} /></i><em>{value}%</em></div>;
}

function TalentRadar({ attendances, referrals }: { attendances: PublicRanking[]; referrals: PublicRanking[] }) {
  const board = (title: string, icon: React.ReactNode, entries: PublicRanking[], unit: string) => <section><h3>{icon}{title}</h3>{entries.length ? entries.slice(0, 3).map((entry, index) => <div key={`${title}-${entry.name}`}><b>{index + 1}</b><i className={entry.photo ? "has-photo" : ""} style={entry.photo ? { backgroundImage: `url("${entry.photo}")` } : undefined}>{!entry.photo && entry.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</i><span><strong>{entry.name}</strong><small>{entry.department || "Setor não informado"}</small></span><em>{entry.count}<small>{unit}</small></em></div>) : <p className="public-ops-empty"><ListTodo /><span>Sem registros na competência.<small>Os principais resultados serão exibidos aqui.</small></span></p>}</section>;
  return <article className="public-ops-panel public-talent-radar"><header><span><Trophy />Destaques do mês</span><small>Produtividade registrada na plataforma</small></header><div>{board("Top 3 atendimentos", <Headphones />, attendances, "atend.")}{board("Top 3 indicações", <Star />, referrals, "indic.")}</div></article>;
}

function ActivityChart({ title, subtitle, days, series }: { title: string; subtitle: string; days: PublicDay[]; series: Series[] }) {
  const width = 1000; const height = 190; const top = 18; const bottom = 25; const left = 24; const right = 4;
  const max = Math.max(1, ...days.flatMap((day) => series.map((entry) => Number(day[entry.key] ?? 0))));
  const chartMax = Math.max(4, Math.ceil(max / 2) * 2);
  const point = (value: number, index: number) => `${days.length <= 1 ? width / 2 : left + index / (days.length - 1) * (width - left - right)},${top + (height - top - bottom) * (1 - value / chartMax)}`;
  const labels = days.length ? [days[0], days[Math.floor((days.length - 1) / 2)], days[days.length - 1]] : [];
  const ticks = [chartMax, Math.round(chartMax * .75), Math.round(chartMax * .5), Math.round(chartMax * .25), 0];
  return <article className="public-ops-panel public-bi-chart"><header><span><TrendingUp />{title}<small>{subtitle}</small></span><div>{series.map((entry) => <b key={String(entry.key)}><i style={{ background: entry.color }} />{entry.label}</b>)}</div></header><div className="public-bi-chart-canvas"><span className="public-bi-y-axis">{ticks.map((tick) => <b key={tick}>{tick}</b>)}</span><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={title}><g className="grid">{ticks.map((tick) => { const y = top + (height - top - bottom) * (1 - tick / chartMax); return <line key={tick} x1={left} x2={width - right} y1={y} y2={y} />; })}</g>{series.map((entry) => { const points = days.map((day, index) => point(Number(day[entry.key] ?? 0), index)); return <g key={String(entry.key)}><polygon points={`${left},${height - bottom} ${points.join(" ")} ${width - right},${height - bottom}`} fill={entry.color} opacity=".055" /><polyline points={points.join(" ")} fill="none" stroke={entry.color} strokeWidth="4" vectorEffect="non-scaling-stroke" />{days.map((day, index) => { const [cx, cy] = point(Number(day[entry.key] ?? 0), index).split(","); return Number(day[entry.key] ?? 0) > 0 ? <circle key={`${day.date}-${String(entry.key)}`} cx={cx} cy={cy} r="4" fill={entry.color} vectorEffect="non-scaling-stroke" /> : null; })}</g>; })}</svg><div className="public-bi-chart-labels">{labels.map((day) => <span key={day.date}>{new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>)}</div></div></article>;
}

function DepartmentView({ department }: { department: PublicDepartment }) {
  const taskRate = percentage(department.completedTasks, department.tasks);
  const sourceLabels = [department.sources.agenda && "Agenda", department.sources.tasks && "Tarefas", department.sources.support && "Atendimentos", department.sources.commercial && "CRM", department.sources.followUp && "Acompanhamento", department.sources.lia && "LIA"].filter(Boolean) as string[];
  const series: Series[] = [
    ...(department.sources.agenda ? [{ key: "commitments" as const, label: "Agenda", color: "#2f7cf6" }] : []),
    ...(department.sources.tasks ? [{ key: "tasks" as const, label: "Tarefas", color: "#8b5cf6" }] : []),
    ...(department.sources.support ? [{ key: "attendances" as const, label: "Atendimentos", color: "#12b8a6" }] : []),
    ...(department.sources.followUp ? [{ key: "followUps" as const, label: "Acompanhamentos", color: "#f59e0b" }] : []),
    ...(department.sources.lia ? [{ key: "lia" as const, label: "LIA", color: "#ec4899" }] : []),
    ...(department.sources.commercial ? [{ key: "sales" as const, label: "Vendas", color: "#22c55e" }] : []),
  ];
  return <>
    <section className="public-ops-section-heading public-bi-section-heading"><span><BriefcaseBusiness /></span><div><small>SETOR EM FOCO</small><h2>{department.name}</h2><p>{sourceLabels.length ? `Fontes alimentadas: ${sourceLabels.join(" · ")}.` : "Ainda não houve alimentação operacional nesta competência."}</p></div>{department.commercial.enabled && <b><WalletCards />Visão comercial ativa</b>}</section>
    <section className="public-ops-kpis public-bi-kpis department dynamic">{department.sources.agenda && <Metric icon={<CalendarDays />} label="Compromissos" value={department.commitments} note={`${department.upcomingCommitments} próximos`} />}{department.sources.tasks && <Metric icon={<ListTodo />} label="Tarefas ativas" value={department.activeTasks} note={`${department.tasks} no mês`} />}{department.sources.tasks && <Metric icon={<CheckCircle2 />} label="Finalizadas" value={department.completedTasks} note={`${taskRate}% concluídas`} />}{department.sources.support && <Metric icon={<Headphones />} label="Atendimentos" value={department.attendances} note={`${department.solvedAttendances} solucionados`} />}{department.sources.followUp && <Metric icon={<Activity />} label="Acompanhamentos" value={department.followUps} note={`${department.completedFollowUps} concluídos`} />}{department.sources.lia && <Metric icon={<Sparkles />} label="Acompanhamento LIA" value={department.liaFollowUps} note={`${department.completedLiaFollowUps} concluídos`} />}{department.goals.trackingCount > 0 && <Metric icon={<Target />} label="Meta de acompanhamento" value={`${department.goals.trackingActual}/${department.goals.trackingCount}`} note={`${department.goals.trackingProgress}% atingido`} />}<Metric icon={<UsersRound />} label="Colaboradores" value={department.collaborators} note="vinculados ao setor" /></section>
    {department.commercial.enabled && <CommercialDepartment department={department} />}
    <section className="public-bi-main-grid department-grid"><ActivityChart title="Evolução diária do setor" subtitle={sourceLabels.length ? `Somente fontes alimentadas: ${sourceLabels.join(", ")}` : "Sem movimentação na competência"} days={department.activityByDay} series={series.length ? series : [{ key: "tasks", label: "Sem dados", color: "#64748b" }]} /><article className="public-ops-panel public-collaborator-ranking"><header><span><Trophy />Destaques em soluções</span><small>Top 5 do setor</small></header>{department.topCollaborators.length ? department.topCollaborators.map((entry, index) => <div key={entry.id}><b>{index + 1}</b><span className={entry.photo ? "has-photo" : ""} style={entry.photo ? { backgroundImage: `url("${entry.photo}")` } : undefined}>{!entry.photo && entry.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><p><strong>{entry.name}</strong><small>{entry.role || department.name}</small></p><em>{entry.solutions} soluções</em></div>) : <p className="public-ops-empty">Ainda não há soluções concluídas neste recorte.</p>}</article></section>
  </>;
}

function CommercialDepartment({ department }: { department: PublicDepartment }) {
  const commercial = department.commercial;
  return <section className="public-commercial-strip">
    <GoalGauge label="Meta de receita" value={money(commercial.revenueCents)} target={commercial.valueGoalCents ? money(commercial.valueGoalCents) : "Sem meta cadastrada"} progress={commercial.valueProgress} />
    <GoalGauge label="Meta de vendas" value={`${commercial.sales} vendas`} target={commercial.salesGoal ? `Meta: ${commercial.salesGoal}` : "Sem meta cadastrada"} progress={commercial.salesProgress} />
    <article><Activity /><span><small>Oportunidades</small><strong>{commercial.opportunities}</strong><p>{commercial.leads} leads · {commercial.directSales} diretas</p></span></article>
    <article><WalletCards /><span><small>Receita do mês</small><strong>{money(commercial.revenueCents)}</strong><p>Pipeline: {money(commercial.pipelineCents)}</p></span></article>
    <article><Target /><span><small>Conversão</small><strong>{commercial.conversionRate}%</strong><p>{commercial.sales} de {commercial.opportunities}</p></span></article>
    {commercial.topSellers[0] && <article className="commercial-leader"><Trophy /><span><small>Liderança comercial</small><strong>{commercial.topSellers[0].name}</strong><p>{commercial.topSellers[0].sales} vendas · {money(commercial.topSellers[0].revenueCents)}</p></span></article>}
  </section>;
}

function GoalGauge({ label, value, target, progress }: { label: string; value: string; target: string; progress: number }) {
  return <article className="public-goal-gauge"><div style={{ "--public-goal": `${Math.min(100, progress)}%` } as React.CSSProperties}><strong>{progress}%</strong></div><span><small>{label}</small><strong>{value}</strong><p>{target}</p></span></article>;
}

function ReferralsView({ referrals, activity }: { referrals: PublicOverviewData["referrals"]; activity: PublicDay[] }) {
  const maxModule = Math.max(1, ...referrals.modules.map((entry) => entry.count));
  const maxSector = Math.max(1, ...referrals.sectors.map((entry) => entry.count));
  return <>
    <section className="public-ops-section-heading public-bi-section-heading referral"><span><Sparkles /></span><div><small>INDICAÇÕES · COMPETÊNCIA ATUAL</small><h2>Performance de indicações</h2><p>Volumes por colaborador, módulo e setor, sem valores de comissão.</p></div></section>
    <section className="public-ops-kpis public-bi-kpis department"><Metric icon={<Sparkles />} label="Enviadas" value={referrals.total} note="indicações registradas" /><Metric icon={<CheckCircle2 />} label="Encaminhadas" value={referrals.forwarded} note={`${percentage(referrals.forwarded, referrals.total)}% do total`} /><Metric icon={<BadgeCheck />} label="Contratações" value={referrals.hired} note={`${percentage(referrals.hired, referrals.total)}% do total`} /><Metric icon={<BriefcaseBusiness />} label="Configuradas" value={referrals.configured} note="clientes configurados" /><Metric icon={<Trophy />} label="Aprovadas" value={referrals.approved} note="quantidade, sem valores" /></section>
    <section className="public-referral-bi-grid"><ActivityChart title="Indicações por dia" subtitle="Evolução de envios na competência" days={activity} series={[{ key: "referrals", label: "Indicações", color: "#8b5cf6" }]} /><ReferralPodium entries={referrals.topSenders} /></section>
    <section className="public-referral-grid"><RankingPanel title="Top 3 módulos indicados" icon={<Sparkles />} entries={referrals.modules} max={maxModule} /><RankingPanel title="Top 3 setores por indicações" icon={<UsersRound />} entries={referrals.sectors} max={maxSector} /></section>
  </>;
}

function ReferralPodium({ entries }: { entries: PublicRanking[] }) {
  const podium = entries.slice(0, 3);
  return <article className="public-ops-panel public-referral-podium"><header><span><Trophy />Top 3 em indicações</span><small>Ranking da competência</small></header>{podium.length ? <div>{podium.map((entry, index) => <section className={`rank-${index + 1}`} key={`${entry.name}-${index}`}><b>{index + 1}</b><i className={entry.photo ? "has-photo" : ""} style={entry.photo ? { backgroundImage: `url("${entry.photo}")` } : undefined}>{!entry.photo && entry.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</i><strong>{entry.name}</strong><small>{entry.department || "Setor não informado"}</small><em>{entry.count}<span> indicações</span></em></section>)}</div> : <p className="public-ops-empty">Nenhuma indicação registrada.</p>}</article>;
}

function RankingPanel({ title, icon, entries, max }: { title: string; icon: React.ReactNode; entries: PublicRanking[]; max: number }) {
  return <article className="public-ops-panel public-ranking-panel"><header><span>{icon}{title}</span></header>{entries.length ? entries.slice(0, 3).map((entry, index) => <div key={`${entry.name}-${index}`}><b>{index + 1}</b><span><strong>{entry.name}</strong><i><em style={{ width: `${entry.count / max * 100}%` }} /></i></span><strong>{entry.count}</strong></div>) : <p className="public-ops-empty">Nenhuma indicação registrada.</p>}</article>;
}
