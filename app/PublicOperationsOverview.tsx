"use client";

import {
  Activity, BadgeCheck, BarChart3, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3,
  Headphones, ListTodo, Pause, Play, RefreshCw, Sparkles, Target, TrendingUp, Trophy, UsersRound, WalletCards,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

type PublicCollaborator = { id: string; name: string; role: string; photo: string; solutions: number };
type PublicRanking = { name: string; count: number; department?: string };
type PublicDay = { date: string; commitments: number; tasks: number; attendances: number; referrals?: number; sales: number };
type PublicSeller = { name: string; sales: number; revenueCents: number; opportunities: number };
type PublicCommercial = {
  enabled: boolean; leads: number; opportunities: number; sales: number; directSales: number; revenueCents: number;
  pipelineCents: number; conversionRate: number; valueGoalCents: number; salesGoal: number; valueProgress: number;
  salesProgress: number; topSellers: PublicSeller[];
};
type PublicDepartment = {
  id: string; name: string; commitments: number; upcomingCommitments: number; tasks: number; activeTasks: number;
  completedTasks: number; attendances: number; solvedAttendances: number; collaborators: number;
  topCollaborators: PublicCollaborator[]; activityByDay: PublicDay[]; commercial: PublicCommercial;
};
type PublicOverviewData = {
  generatedAt: string; month: string; monthLabel: string; refreshAfterSeconds: number;
  overview: {
    departments: number; commitments: number; tasks: number; activeTasks: number; completedTasks: number;
    attendances: number; solvedAttendances: number; collaborators: number; activityByDay: PublicDay[];
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
  const maxDepartmentVolume = useMemo(() => Math.max(1, ...(data?.departments.map((entry) => entry.tasks + entry.attendances + entry.commitments) ?? [1])), [data]);
  const secondsSinceUpdate = data ? Math.max(0, Math.floor((clock - new Date(data.generatedAt).getTime()) / 1_000)) : 0;

  if (error && !data) return <main className="public-ops-state"><Image src="/dontus-logo.png" alt="Dontus" width={190} height={54} unoptimized /><h1>Painel indisponível</h1><p>{error}</p><button onClick={() => void load()}><RefreshCw />Tentar novamente</button></main>;
  if (!data) return <main className="public-ops-state"><Image src="/dontus-logo.png" alt="Dontus" width={190} height={54} unoptimized /><RefreshCw className="spin" /><p>Sincronizando indicadores...</p></main>;

  const completionRate = percentage(data.overview.completedTasks, data.overview.tasks);
  const solutionRate = percentage(data.overview.solvedAttendances, data.overview.attendances);
  return <main className="public-ops-page public-bi-page">
    <header className="public-ops-header public-bi-header">
      <Image src="/dontus-logo.png" alt="Dontus Gestão Odontológica" width={158} height={46} unoptimized />
      <span><small>COMMAND CENTER · OPERAÇÕES</small><h1>Dontus BI em tempo real</h1><p>Competência: <strong>{data.monthLabel}</strong></p></span>
      <div className="public-bi-controls">
        <label><CalendarDays /><span>Competência</span><input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setTab("overview"); }} /></label>
        <button className={autoRotate ? "active" : ""} onClick={() => setAutoRotate((current) => !current)}>{autoRotate ? <Pause /> : <Play />}<span>{autoRotate ? "Pausar rotação" : "Retomar rotação"}</span></button>
        <button onClick={() => void load()} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""} /><span>Atualizar</span></button>
        <b><i />AO VIVO<small>{secondsSinceUpdate < 5 ? "agora" : `há ${secondsSinceUpdate}s`}</small></b>
      </div>
    </header>

    <nav className="public-ops-tabs public-bi-tabs" aria-label="Setores e indicadores">
      <button className={tab === "overview" ? "active" : ""} onClick={() => chooseTab("overview")}>Visão geral</button>
      {data.departments.map((entry) => <button className={tab === entry.id ? "active" : ""} onClick={() => chooseTab(entry.id)} key={entry.id}>{entry.name}</button>)}
      <button className={tab === "referrals" ? "active referral" : "referral"} onClick={() => chooseTab("referrals")}><Sparkles />Indicações</button>
      {autoRotate && <i className="public-bi-rotation"><b style={{ width: `${rotationProgress}%` }} /></i>}
    </nav>

    <section className={`public-bi-stage ${tab === "overview" ? "overview-stage" : tab === "referrals" ? "referrals-stage" : department?.commercial.enabled ? "department-stage commercial-stage" : "department-stage"}`} key={tab}>
      {tab === "overview" && <OverviewView data={data} completionRate={completionRate} solutionRate={solutionRate} maxDepartmentVolume={maxDepartmentVolume} onDepartment={chooseTab} />}
      {department && <DepartmentView department={department} />}
      {tab === "referrals" && <ReferralsView referrals={data.referrals} activity={data.overview.activityByDay} />}
    </section>
    <footer className="public-ops-footer"><span><Clock3 />Atualização automática a cada {data.refreshAfterSeconds}s</span><span>Rotação entre telas a cada {ROTATION_LABEL}</span><span>Valores de comissão não são exibidos</span></footer>
  </main>;
}

function OverviewView({ data, completionRate, solutionRate, maxDepartmentVolume, onDepartment }: { data: PublicOverviewData; completionRate: number; solutionRate: number; maxDepartmentVolume: number; onDepartment: (id: string) => void }) {
  return <>
    <section className="public-ops-kpis public-bi-kpis"><Metric icon={<BriefcaseBusiness />} label="Setores ativos" value={data.overview.departments} note="estrutura vinculada" /><Metric icon={<CalendarDays />} label="Compromissos" value={data.overview.commitments} note="na competência" /><Metric icon={<ListTodo />} label="Tarefas" value={data.overview.tasks} note={`${data.overview.activeTasks} em andamento`} /><Metric icon={<CheckCircle2 />} label="Finalizadas" value={data.overview.completedTasks} note={`${completionRate}% de conclusão`} /><Metric icon={<Headphones />} label="Atendimentos" value={data.overview.attendances} note={`${solutionRate}% solucionados`} /><Metric icon={<UsersRound />} label="Colaboradores" value={data.overview.collaborators} note="ativos nos setores" /></section>
    <section className="public-bi-main-grid">
      <ActivityChart title="Pulso operacional diário" subtitle="Volume de movimentações no mês" days={data.overview.activityByDay} series={[{ key: "commitments", label: "Agenda", color: "#2f7cf6" }, { key: "tasks", label: "Tarefas", color: "#8b5cf6" }, { key: "attendances", label: "Atendimentos", color: "#12b8a6" }]} />
      <article className="public-ops-panel public-ops-progress-panel public-bi-efficiency"><header><span><BadgeCheck />Eficiência operacional</span></header><ProgressRow label="Conclusão de tarefas" value={completionRate} detail={`${data.overview.completedTasks} de ${data.overview.tasks}`} /><ProgressRow label="Solução de atendimentos" value={solutionRate} detail={`${data.overview.solvedAttendances} de ${data.overview.attendances}`} /><ProgressRow label="Indicações encaminhadas" value={percentage(data.referrals.forwarded, data.referrals.total)} detail={`${data.referrals.forwarded} de ${data.referrals.total}`} /></article>
    </section>
    <section className="public-bi-bottom-grid">
      <article className="public-ops-panel public-department-volume"><header><span><BarChart3 />Movimentação por setor</span><small>Agenda, tarefas e atendimentos</small></header><div style={{ gridTemplateRows: `repeat(${Math.max(1, data.departments.length)}, minmax(0, 1fr))` }}>{data.departments.map((entry) => { const total = entry.tasks + entry.attendances + entry.commitments; return <button key={entry.id} onClick={() => onDepartment(entry.id)}><span><strong>{entry.name}</strong><small>{entry.collaborators} colaborador(es)</small></span><i><b style={{ width: `${total / maxDepartmentVolume * 100}%` }} /></i><em>{total}</em></button>; })}</div></article>
      <article className="public-ops-panel public-bi-referral-highlight"><header><span><Sparkles />Radar de indicações</span></header><strong>{data.referrals.total}<small>enviadas no mês</small></strong><strong>{data.referrals.topSenders[0]?.name || "Sem registros"}<small>líder em indicações</small></strong><strong>{data.referrals.modules[0]?.name || "Sem registros"}<small>módulo mais indicado</small></strong></article>
    </section>
  </>;
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number | string; note: string }) {
  return <article><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>;
}

function ProgressRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="public-progress-row"><span><strong>{label}</strong><small>{detail}</small></span><i><b style={{ width: `${Math.min(100, value)}%` }} /></i><em>{value}%</em></div>;
}

function ActivityChart({ title, subtitle, days, series }: { title: string; subtitle: string; days: PublicDay[]; series: Series[] }) {
  const width = 1000; const height = 190; const top = 18; const bottom = 25;
  const max = Math.max(1, ...days.flatMap((day) => series.map((entry) => Number(day[entry.key] ?? 0))));
  const point = (value: number, index: number) => `${days.length <= 1 ? width / 2 : index / (days.length - 1) * width},${top + (height - top - bottom) * (1 - value / max)}`;
  const labels = days.length ? [days[0], days[Math.floor((days.length - 1) / 2)], days[days.length - 1]] : [];
  return <article className="public-ops-panel public-bi-chart"><header><span><TrendingUp />{title}<small>{subtitle}</small></span><div>{series.map((entry) => <b key={String(entry.key)}><i style={{ background: entry.color }} />{entry.label}</b>)}</div></header><div className="public-bi-chart-canvas"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={title}><g className="grid"><line x1="0" x2={width} y1={top} y2={top} /><line x1="0" x2={width} y1={height / 2} y2={height / 2} /><line x1="0" x2={width} y1={height - bottom} y2={height - bottom} /></g>{series.map((entry) => <polyline key={String(entry.key)} points={days.map((day, index) => point(Number(day[entry.key] ?? 0), index)).join(" ")} fill="none" stroke={entry.color} strokeWidth="4" vectorEffect="non-scaling-stroke" />)}</svg><div className="public-bi-chart-labels">{labels.map((day) => <span key={day.date}>{new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>)}</div></div></article>;
}

function DepartmentView({ department }: { department: PublicDepartment }) {
  const taskRate = percentage(department.completedTasks, department.tasks);
  return <>
    <section className="public-ops-section-heading public-bi-section-heading"><span><BriefcaseBusiness /></span><div><small>SETOR EM FOCO</small><h2>{department.name}</h2><p>Dados alimentados pelos colaboradores vinculados, consolidados pela competência.</p></div>{department.commercial.enabled && <b><WalletCards />Visão comercial ativa</b>}</section>
    <section className="public-ops-kpis public-bi-kpis department"><Metric icon={<CalendarDays />} label="Compromissos" value={department.commitments} note={`${department.upcomingCommitments} próximos`} /><Metric icon={<ListTodo />} label="Tarefas ativas" value={department.activeTasks} note={`${department.tasks} no mês`} /><Metric icon={<CheckCircle2 />} label="Finalizadas" value={department.completedTasks} note={`${taskRate}% concluídas`} /><Metric icon={<Headphones />} label="Atendimentos" value={department.attendances} note={`${department.solvedAttendances} solucionados`} /><Metric icon={<UsersRound />} label="Colaboradores" value={department.collaborators} note="vinculados ao setor" /></section>
    {department.commercial.enabled && <CommercialDepartment department={department} />}
    <section className="public-bi-main-grid department-grid"><ActivityChart title="Evolução diária do setor" subtitle="Agenda, tarefas, atendimentos e vendas" days={department.activityByDay} series={[{ key: "commitments", label: "Agenda", color: "#2f7cf6" }, { key: "tasks", label: "Tarefas", color: "#8b5cf6" }, { key: "attendances", label: "Atendimentos", color: "#12b8a6" }, { key: "sales", label: "Vendas", color: "#f59e0b" }]} /><article className="public-ops-panel public-collaborator-ranking"><header><span><Trophy />Destaques em soluções</span><small>Top 5 do setor</small></header>{department.topCollaborators.length ? department.topCollaborators.map((entry, index) => <div key={entry.id}><b>{index + 1}</b><span className={entry.photo ? "has-photo" : ""} style={entry.photo ? { backgroundImage: `url("${entry.photo}")` } : undefined}>{!entry.photo && entry.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><p><strong>{entry.name}</strong><small>{entry.role || department.name}</small></p><em>{entry.solutions} soluções</em></div>) : <p className="public-ops-empty">Ainda não há soluções concluídas neste recorte.</p>}</article></section>
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
  return <article className="public-ops-panel public-referral-podium"><header><span><Trophy />Top 3 em indicações</span><small>Ranking da competência</small></header>{podium.length ? <div>{podium.map((entry, index) => <section className={`rank-${index + 1}`} key={`${entry.name}-${index}`}><b>{index + 1}</b><i>{entry.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</i><strong>{entry.name}</strong><small>{entry.department || "Setor não informado"}</small><em>{entry.count}<span> indicações</span></em></section>)}</div> : <p className="public-ops-empty">Nenhuma indicação registrada.</p>}</article>;
}

function RankingPanel({ title, icon, entries, max }: { title: string; icon: React.ReactNode; entries: PublicRanking[]; max: number }) {
  return <article className="public-ops-panel public-ranking-panel"><header><span>{icon}{title}</span></header>{entries.length ? entries.slice(0, 3).map((entry, index) => <div key={`${entry.name}-${index}`}><b>{index + 1}</b><span><strong>{entry.name}</strong><i><em style={{ width: `${entry.count / max * 100}%` }} /></i></span><strong>{entry.count}</strong></div>) : <p className="public-ops-empty">Nenhuma indicação registrada.</p>}</article>;
}
