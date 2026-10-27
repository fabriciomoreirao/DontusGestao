"use client";

import { customerSuccessScore } from "@/lib/commission-rules";
import CsDistributionPanel from "@/app/CsDistributionPanel";
import CsDistributionIndicators from "@/app/CsDistributionIndicators";
import { distributionQueue, distributionWarning, unknownClientVersion, type ClientDistribution } from "@/lib/client-distribution";

import { useReminderFilter } from "@/app/ReminderFilters";

import {
  Activity, AlertTriangle, ArrowRight, BadgeCheck, Ban, BarChart3, CalendarDays, Check, CheckCircle2,
  Clock3, Columns3, Copy, ExternalLink, Link2, List, MessageSquareText, Pencil, Phone, Plus, RotateCcw, Save,
  Search, Send, Settings, ShieldCheck, Trash2, UserRound, X, XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AgendaModuleData } from "@/app/AgendaModule";
import type { TaskModuleData } from "@/app/TasksModule";
import { CancellationEntryModal, type CancellationDetail } from "@/app/CancellationsModule";

type OperationResult = { id?: string; createdProtocol?: string } | false;
type CsFlow = "onboarding" | "evolution";
type CsTrack = "activation" | "retention";
import { cardShareUrl } from "@/app/CardLinkEnhancer";
import { canResumeCsJourney, isClosedCsJourney, requestCsConference, resumeCsJourney, type CsPhase } from "@/lib/cs-journey";

type WorkItem = {
  id: string; module: string; title: string; customer_id: string | null; customer_name: string;
  owner: string; status: string; amount_cents: number; description: string; version: number;
  updated_at: string; created_at: string;
};
type CatalogOption = { id: string; catalog: string; name: string; description: string; active: boolean };
type Customer = { id: string; trade_name: string; legal_name: string; document_masked?: string; phone: string; product_version: string; cs_owner: string };
type Employee = { id: string; displayName: string; email: string; departmentId: string | null; departmentName: string; departmentNames: string[]; photoDataUrl?: string; active: boolean; isCoordinator?: boolean };
type CurrentUser = { email: string; displayName: string; role: string; department: string; isCoordinator: boolean };
type HistoryEntry = { text: string; createdAt: string; actor?: string; kind?: string };
type ScoreEvolutionEntry = { id: string; createdAt: string; actor: string; period: string; score: number; previousScore: number; featuresBase: string[]; featuresActive: string[]; featuresPlus: string[]; summary: string; kind: "Evolução de score" };
type CsJourney = {
  kind: "csJourney";
  track: CsTrack;
  phase: CsPhase;
  sourceLeadId?: string;
  clientId?: string;
  scheduledAt?: string;
  commerciallyApproved?: boolean;
  checkedAt?: string;
  checkedBy?: string;
  onboardingStartedAt?: string;
  firstMeetingAt?: string;
  firstMeetingTime?: string;
  firstMeetingCommitmentId?: string;
  firstMeetingCompletedAt?: string;
  trainingAt?: string;
  trainingTime?: string;
  trainingCommitmentId?: string;
  trainingCompletedAt?: string;
  singleAlignmentAt?: string;
  singleAlignmentTime?: string;
  singleAlignmentCommitmentId?: string;
  singleAlignmentCompletedAt?: string;
  rescheduledAt?: string;
  rescheduledTime?: string;
  meetingLink?: string;
  trackingStartedAt?: string;
  finalReason?: string;
  previousCycles?: Record<string, unknown>[];
  approvalReason?: string;
  rejectionReason?: string;
  status?: string;
  usage?: string;
  callStatus?: string;
  usageByDay?: Record<string, string>;
  conferenceRequestedAt?: string;
  conferenceFromPhase?: "onboarding" | "tracking";
  conferenceConfirmedAt?: string;
  featuresBase: string[];
  featuresActive: string[];
  featuresPlus: string[];
  scoreEvolution?: ScoreEvolutionEntry[];
  labels: string[];
  strategicAccount?: boolean;
  strategicNetworkId?: string;
  strategicNetworkName?: string;
  strategicUnitId?: string;
  strategicUnitName?: string;
  cancellationRequestedAt?: string;
  cancellationRequestedBy?: string;
  cancellationTaskId?: string;
  cancellationTaskProtocol?: string;
  cancellationTaskLink?: string;
  cancellationOutcome?: "requested" | "cancelled" | "reverted";
  cancellationPendingApproval?: boolean;
  cancellationReason?: string;
  cancellationResolvedAt?: string;
  follows: HistoryEntry[];
};

type CommercialLead = {
  phone?: string; source?: string; seller?: string; temperature?: string; stage?: string;
  products?: Array<{ product?: string; plan?: string; quantity?: number; value?: number }>;
  follows?: Array<{ text?: string; createdAt?: string; author?: string }>;
};

const PHASES: Array<{ id: CsPhase; label: string }> = [
  { id: "validation", label: "Validação" },
  { id: "onboarding", label: "Onboarding" },
  { id: "tracking", label: "Acompanhamento" },
  { id: "conference", label: "Conferência" },
  { id: "finished", label: "Finalizados" },
  { id: "unsuccessful", label: "Finalizados sem sucesso" },
  { id: "cancelled", label: "Cancelados" },
  { id: "cancelledWithoutTraining", label: "Cancelado sem treinamento" },
];

const DEFAULT_STATUSES = ["Pendente", "Em andamento", "Aguardando cliente", "Em acompanhamento", "Em risco", "Conferência"];
const now = () => new Date().toISOString();
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const dateTime = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const dateOnly = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value)) : "—";
const trackedDays = (journey: CsJourney, item: WorkItem) => Math.max(0, Math.floor(((isClosedCsJourney(journey.phase) ? new Date(journey.conferenceConfirmedAt || journey.cancellationResolvedAt || item.updated_at).getTime() : Date.now()) - new Date(journey.trackingStartedAt || journey.onboardingStartedAt || item.updated_at).getTime()) / 86_400_000));
const interactionDays = (journey: CsJourney, item: WorkItem) => Math.max(0, Math.floor((Date.now() - new Date(journey.follows.at(-1)?.createdAt || journey.trackingStartedAt || journey.onboardingStartedAt || item.updated_at).getTime()) / 86_400_000));
const featureTokens = (values: string[]) => [...new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
const catalogFeatureIsBase = (entry: CatalogOption) => {
  if (entry.catalog === "csFeatureBase") return true;
  try { return (JSON.parse(entry.description || "{}") as { featureBase?: boolean }).featureBase === true; }
  catch { return false; }
};
const healthScore = customerSuccessScore;
const trackingMilestones = (track: CsTrack) => track === "retention" ? [1, 2, 3, 4, 7, 14, 21, 30] : [1, 2, 3, 4, 7, 14, 21, 30, 60, 90];
const usagePercent = (value?: string) => /nao|não|sem uso/i.test(value || "") ? 0 : /parcial/i.test(value || "") ? 50 : value ? 100 : 0;

function UsageLineChart({ milestones, usageByDay }: { milestones: number[]; usageByDay: Record<string, string> }) {
  const width = 1000; const height = 190; const left = 44; const right = 20; const top = 18; const bottom = 42;
  const usableWidth = width - left - right; const usableHeight = height - top - bottom;
  const points = milestones.map((day, index) => {
    const x = left + (milestones.length === 1 ? usableWidth / 2 : index / (milestones.length - 1) * usableWidth);
    const value = usagePercent(usageByDay[String(day)]);
    const y = top + (100 - value) / 100 * usableHeight;
    return { day, x, y, value, informed: Boolean(usageByDay[String(day)]) };
  });
  const smoothLine = points.length ? points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const middleX = (previous.x + point.x) / 2;
    return `${path} C ${middleX},${previous.y} ${middleX},${point.y} ${point.x},${point.y}`;
  }, `M ${points[0].x},${points[0].y}`) : "";
  const baseline = height - bottom;
  const area = points.length ? `${smoothLine} L ${points.at(-1)?.x},${baseline} L ${points[0].x},${baseline} Z` : "";
  const animationKey = milestones.map((day) => usageByDay[String(day)] || "empty").join("|");
  return <div className="cs-usage-line-chart" aria-label={`Evolução da utilização nos dias ${milestones.map((day) => `D+${day}`).join(", ")}`}>
    <svg key={animationKey} viewBox={`0 0 ${width} ${height}`} role="img">
      <defs>
        <linearGradient id="usageAreaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity=".34" /><stop offset="100%" stopColor="var(--primary)" stopOpacity=".025" /></linearGradient>
        <linearGradient id="usageLineGradient" x1="0" x2="1"><stop offset="0%" stopColor="#06b6d4" /><stop offset="52%" stopColor="var(--primary)" /><stop offset="100%" stopColor="#6366f1" /></linearGradient>
        <filter id="usageGlow" x="-20%" y="-30%" width="140%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#168be6" floodOpacity=".24" /></filter>
      </defs>
      {[100, 50, 0].map((value) => { const y = top + (100 - value) / 100 * usableHeight; return <g key={value}><line className="cs-usage-grid-line" x1={left} x2={width - right} y1={y} y2={y} /><text className="cs-usage-axis-label" x={left - 10} y={y + 4} textAnchor="end">{value}%</text></g>; })}
      {points.map((point) => <line className="cs-usage-day-guide" key={`guide-${point.day}`} x1={point.x} x2={point.x} y1={top} y2={baseline} />)}
      {area && <path className="cs-usage-area" d={area} />}
      {smoothLine && <path className="cs-usage-line" d={smoothLine} pathLength="1" filter="url(#usageGlow)" />}
      {points.map((point, index) => <g className={`cs-usage-point ${point.informed ? "informed" : "empty"}`} style={{ "--point-delay": `${Math.min(index * 55, 420)}ms` } as CSSProperties} key={point.day}><circle cx={point.x} cy={point.y} r="6" /><title>{`D+${point.day}: ${usageByDay[String(point.day)] || "Não informado"}`}</title>{point.informed && <text className="cs-usage-value-label" x={point.x} y={Math.max(13, point.y - 13)} textAnchor="middle">{point.value}%</text>}<text className="cs-usage-day-label" x={point.x} y={height - 14} textAnchor="middle">D+{point.day}</text></g>)}
    </svg>
  </div>;
}

export function parseJourney(value: string): CsJourney | null {
  try {
    const raw = JSON.parse(value) as Partial<CsJourney> & { phase?: string; features?: string[] };
    if (raw.kind !== "csJourney") return null;
    const legacyPhase: Record<string, CsPhase> = { activation: "onboarding", evolution: "tracking", validationFinal: "unsuccessful", closed: "finished" };
    const originalPhase = String(raw.phase ?? "validation");
    const parsedPhase = originalPhase === "closed" && raw.finalReason ? "unsuccessful" : legacyPhase[originalPhase] ?? raw.phase ?? "validation";
    const phase = PHASES.some((entry) => entry.id === parsedPhase) ? parsedPhase as CsPhase : "validation";
    const storedFollows = Array.isArray(raw.follows) ? raw.follows : [];
    const hasCommercialScheduleComment = storedFollows.some((entry) => /kick off.*agendad|agendad.*kick off/i.test(entry.text || ""));
    const commercialScheduleComment: HistoryEntry[] = raw.sourceLeadId && raw.scheduledAt && !hasCommercialScheduleComment
      ? [{ kind: "Comercial", text: `Kick off agendado pelo Comercial para ${dateOnly(raw.scheduledAt)} às ${raw.firstMeetingTime || raw.scheduledAt.slice(11, 16)}.`, createdAt: raw.scheduledAt, actor: "Comercial" }]
      : [];
    return {
      ...raw,
      kind: "csJourney",
      track: raw.track === "retention" ? "retention" : originalPhase === "evolution" ? "retention" : "activation",
      phase,
      featuresBase: Array.isArray(raw.featuresBase) ? raw.featuresBase : [],
      featuresActive: Array.isArray(raw.featuresActive) ? raw.featuresActive : Array.isArray(raw.features) ? raw.features : [],
      featuresPlus: Array.isArray(raw.featuresPlus) ? raw.featuresPlus : [],
      scoreEvolution: Array.isArray(raw.scoreEvolution) ? raw.scoreEvolution : [],
      labels: Array.isArray(raw.labels) ? raw.labels : [],
      usageByDay: raw.usageByDay && typeof raw.usageByDay === "object" ? raw.usageByDay : {},
      status: /kick off.*agendado.*comercial/i.test(raw.status || "") ? "Pendente" : raw.status,
      follows: [...commercialScheduleComment, ...storedFollows],
    };
  } catch { return null; }
}

function parseCommercial(value: string): CommercialLead | null {
  try {
    const parsed = JSON.parse(value) as CommercialLead & { kind?: string };
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}

function phaseTone(phase: CsPhase) {
  if (phase === "finished") return "positive";
  if (canResumeCsJourney(phase)) return "negative";
  if (phase === "conference") return "warning";
  return "info";
}

export default function CustomerSuccessJourneyModule({
  flow, catalogs, items, customers, agendaModule, taskModule, employees, currentUser, busy, canCreate, canEdit, canDelete, distribution,
  canCreateTask, operate, onOpenSettings,
}: {
  flow: CsFlow; catalogs: CatalogOption[]; items: WorkItem[]; customers: Customer[]; agendaModule: AgendaModuleData | null;
  taskModule: TaskModuleData | null; employees: Employee[]; currentUser: CurrentUser; busy: boolean;
  distribution?: ClientDistribution[];
  canCreate: boolean; canEdit: boolean; canDelete: boolean; canCreateTask: boolean;
  operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>;
  onOpenSettings?: () => void;
}) {
  const [tab, setTab] = useState<CsPhase>(flow === "evolution" ? "tracking" : "validation");
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [creating, setCreating] = useState(false);
  const [distributionIndicators, setDistributionIndicators] = useState(false);
  const isCoordinator = currentUser.isCoordinator || /admin|gestor|coordenador/i.test(currentUser.role);
  const track: CsTrack = flow === "evolution" ? "retention" : "activation";
  const distributionBoard = distribution?.find(board => board.track === track);
  const featureUniverse = useMemo(() => featureTokens(catalogs
    .filter((entry) => entry.active && ["csFeature", "csFeatureBase", "csFeatureActive", "csFeaturePlus"].includes(entry.catalog) && catalogFeatureIsBase(entry))
    .map((entry) => entry.name)), [catalogs]);

  useEffect(() => setTab(flow === "evolution" ? "tracking" : "validation"), [flow]);

  const records = useMemo(() => items
    .filter((item) => item.module === "cs")
    .map((item) => ({ item, journey: parseJourney(item.description) }))
    .filter((entry): entry is { item: WorkItem; journey: CsJourney } => Boolean(entry.journey && entry.journey.track === track)), [items, track]);
  const openedSharedCard = useRef("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cardId = params.get("card");
    const clientId = params.get("client");
    const requestedKey = cardId || clientId;
    if (!requestedKey || openedSharedCard.current === requestedKey) return;
    const requested = records.find(({ item, journey }) => cardId ? item.id === cardId : item.customer_id === clientId || journey.clientId === clientId);
    if (requested) { openedSharedCard.current = requestedKey; setTab(requested.journey.phase); setSelected(requested.item); }
  }, [records]);
  const counts = useMemo(() => Object.fromEntries(PHASES.map((phase) => [phase.id, records.filter((entry) => entry.journey.phase === phase.id).length])) as Record<CsPhase, number>, [records]);
  const statuses = useMemo(() => {
    const configured = catalogs.filter((entry) => entry.active && ["csWorkflowStatus", "csFinalStatus"].includes(entry.catalog)).map((entry) => entry.name);
    return [...new Set([...configured, ...records.map((entry) => entry.journey.status).filter(Boolean) as string[], ...DEFAULT_STATUSES])];
  }, [catalogs, records]);
  const reminderFilter = useReminderFilter("cs");
  const visible = useMemo(() => records.filter(({ item, journey }) => {
    const needle = normalize(query.trim());
    const commercial = items.find((entry) => entry.id === journey.sourceLeadId);
    const phone = commercial ? parseCommercial(commercial.description)?.phone : "";
    const permitted = isCoordinator || item.owner === currentUser.displayName || journey.phase === "validation";
    return reminderFilter.matches({entityId:item.id,clientId:journey.clientId,title:item.title}) && journey.phase === tab && permitted
      && (!needle || normalize(`${item.id} ${journey.clientId} ${item.title} ${item.customer_name} ${item.owner} ${phone}`).includes(needle))
      && (ownerFilter === "all" || item.owner === ownerFilter)
      && (statusFilter === "all" || (journey.status || "Pendente") === statusFilter);
  }), [records, tab, query, ownerFilter, statusFilter, isCoordinator, currentUser.displayName, items, reminderFilter.matches]);

  const totalTrackingDays = records.filter((entry) => entry.journey.phase === "tracking").reduce((sum, entry) => sum + trackedDays(entry.journey, entry.item), 0);
  const averageHealth = records.filter((entry) => entry.journey.phase === "tracking").length
    ? Math.round(records.filter((entry) => entry.journey.phase === "tracking").reduce((sum, entry) => sum + healthScore(entry.journey, featureUniverse), 0) / records.filter((entry) => entry.journey.phase === "tracking").length)
    : 0;
  const kickOffCount = records.filter((entry) => Boolean(entry.journey.firstMeetingAt || entry.journey.firstMeetingCompletedAt)).length;
  const trainingCount = records.filter((entry) => Boolean(entry.journey.trainingAt || entry.journey.trainingCompletedAt)).length;
  const singleAlignmentCount = records.filter((entry) => Boolean(entry.journey.singleAlignmentAt || entry.journey.singleAlignmentCompletedAt)).length;
  const title = flow === "evolution" ? "Acompanhamento — Retenção" : "Acompanhamento — Ativação";

  const syncFinishedStrategicUnit = async (journey: CsJourney) => {
    if (journey.phase !== "finished" || !journey.strategicNetworkId || !journey.strategicUnitId) return;
    const networkItem = items.find((entry) => entry.id === journey.strategicNetworkId);
    if (!networkItem) return;
    try {
      const network = JSON.parse(networkItem.description || "{}") as {
        kind?: string;
        units?: Array<Record<string, unknown> & { id?: string; name?: string; status?: string }>;
        history?: Array<Record<string, unknown>>;
        [key: string]: unknown;
      };
      const units = Array.isArray(network.units) ? network.units : [];
      const targetUnit = units.find((entry) => entry.id === journey.strategicUnitId);
      if (network.kind !== "enterpriseNetwork" || !targetUnit || targetUnit.status === "Finalizado") return;
      const updatedAt = now();
      const unitName = journey.strategicUnitName || targetUnit.name || networkItem.title;
      await operate({
        action: "updateWorkItem",
        id: networkItem.id,
        title: networkItem.title,
        owner: networkItem.owner,
        customerName: networkItem.customer_name,
        amountCents: networkItem.amount_cents,
        version: networkItem.version,
        description: JSON.stringify({
          ...network,
          units: units.map((entry) => entry.id === journey.strategicUnitId
            ? { ...entry, status: "Finalizado", lastAnalysis: updatedAt.slice(0, 10) }
            : entry),
          history: [...(Array.isArray(network.history) ? network.history : []), {
            id: crypto.randomUUID(),
            createdAt: updatedAt,
            user: currentUser.displayName,
            type: "Acompanhamento finalizado",
            text: `Unidade ${unitName} finalizada após aprovação da conferência.`,
            unitId: journey.strategicUnitId,
          }],
        }),
      }, `Unidade estratégica ${unitName} atualizada como Finalizado.`);
    } catch {
      // A conclusão do acompanhamento permanece salva mesmo se o vínculo legado estiver inválido.
    }
  };

  const saveSelected = async (payload: Record<string, unknown>, success = "Jornada atualizada com sucesso.") => {
    if (!selected) return false;
    const result = await operate({ action: "updateWorkItem", id: selected.id, title: selected.title, owner: selected.owner, customerName: selected.customer_name, amountCents: selected.amount_cents, version: selected.version, ...payload }, success);
    if (result) {
      setSelected((current) => current ? { ...current, ...(payload.owner ? { owner: String(payload.owner) } : {}), ...(payload.description ? { description: String(payload.description) } : {}), version: current.version + 1, updated_at: now() } : current);
      const savedJourney = payload.description ? parseJourney(String(payload.description)) : null;
      if (savedJourney) await syncFinishedStrategicUnit(savedJourney);
    }
    return result;
  };

  return <section className="cs-pipeline-module">
    <header className="cs-pipeline-heading module-page-header">
      <div className="cs-title-icon module-page-title-icon"><Activity size={21} /></div>
      <div><span className="eyebrow">SUCESSO DO CLIENTE</span><h1>{title}</h1><p>Validação, implantação, evolução e retenção em uma jornada auditável.</p></div>
      <div className="cs-heading-actions module-page-actions">{distributionBoard && <button className="secondary-button" type="button" onClick={() => setDistributionIndicators(true)}><BarChart3 size={16} />Indicadores de rodízio</button>}{onOpenSettings && <button className="icon-button commercial-settings-button" onClick={onOpenSettings} title="Configurar jornada e status" aria-label="Configurar jornada e status"><Settings size={18} /></button>}{canCreate && <button className="primary-button" type="button" onClick={() => setCreating(true)}><Plus size={16} /> Inserir cliente</button>}</div>
    </header>

    <section className="cs-pipeline-metrics">
      <article><span><Activity size={17} /></span><small>EM ACOMPANHAMENTO</small><strong>{counts.tracking}</strong><p>{totalTrackingDays} dias acumulados</p></article>
      <article><span><CheckCircle2 size={17} /></span><small>FINALIZADOS</small><strong>{counts.finished}</strong><p>Jornadas concluídas</p></article>
      <article><span><ShieldCheck size={17} /></span><small>HEALTH SCORE MÉDIO</small><strong>{averageHealth}%</strong><p>Funcionalidades cadastradas em uso</p></article>
      <article><span><AlertTriangle size={17} /></span><small>CANCELAMENTOS</small><strong>{counts.cancelled + counts.cancelledWithoutTraining}</strong><p>{records.filter((entry) => entry.journey.cancellationOutcome === "requested").length} solicitação(ões) aberta(s)</p></article>
      <article><span><CalendarDays size={17} /></span><small>KICK OFFS</small><strong>{kickOffCount}</strong><p>{records.filter((entry) => entry.journey.firstMeetingCompletedAt).length} concluído(s)</p></article>
      <article><span><CalendarDays size={17} /></span><small>TREINAMENTOS</small><strong>{trainingCount}</strong><p>{records.filter((entry) => entry.journey.trainingCompletedAt).length} concluído(s)</p></article>
      <article><span><CheckCircle2 size={17} /></span><small>ALINHAMENTOS ÚNICOS</small><strong>{singleAlignmentCount}</strong><p>{records.filter((entry) => entry.journey.singleAlignmentCompletedAt).length} concluído(s)</p></article>
    </section>

    <nav className="cs-pipeline-tabs" aria-label="Etapas do acompanhamento">
      {PHASES.map((phase) => <button key={phase.id} className={tab === phase.id ? "active" : ""} onClick={() => setTab(phase.id)}>{phase.label}<b>{counts[phase.id]}</b></button>)}
    </nav>

    <section className="cs-pipeline-toolbar reminder-filter-toolbar">{reminderFilter.control}
      <label className="cs-pipeline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, ID, responsável ou telefone" /></label>
      <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} aria-label="Filtrar responsável"><option value="all">Todos os responsáveis</option>{[...new Set(records.map((entry) => entry.item.owner).filter(Boolean))].map((owner) => <option key={owner}>{owner}</option>)}</select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar status"><option value="all">Todos os status</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
      <span>{visible.length} resultado(s)</span>
      <div className="cs-view-switch"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Visualizar em cards"><Columns3 size={16} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="Visualizar em lista"><List size={16} /></button></div>
    </section>

    {distributionIndicators && distributionBoard && <CsDistributionIndicators board={distributionBoard} onClose={() => setDistributionIndicators(false)} />}

    {visible.length === 0 ? <div className="cs-pipeline-empty"><ClipboardCheckIcon /><h2>Nenhum cliente nesta etapa</h2><p>Os clientes aparecem automaticamente conforme avançam na jornada.</p></div> : view === "grid" ? <div className="cs-pipeline-grid">{visible.map(({ item, journey }) => <JourneyCard key={item.id} item={item} journey={journey} featureUniverse={featureUniverse} commercial={items.find((entry) => entry.id === journey.sourceLeadId)} employee={employees.find(employee => employee.displayName === item.owner)} canEdit={canEdit} canDelete={canDelete} onOpen={() => setSelected(item)} onDelete={() => void operate({ action: "deleteWorkItem", id: item.id }, "Cliente excluído com sucesso.")} />)}</div> : <JourneyList records={visible} sourceItems={items} featureUniverse={featureUniverse} canDelete={canDelete} onOpen={setSelected} onDelete={(item) => void operate({ action: "deleteWorkItem", id: item.id }, "Cliente excluído com sucesso.")} />}

    {selected && <JourneyDrawer distribution={distribution?.find(board=>board.track===track)} item={selected} journey={parseJourney(selected.description)!} commercialSource={items.find((entry) => entry.id === parseJourney(selected.description)?.sourceLeadId)} catalogs={catalogs.filter((entry) => entry.active)} customers={customers} agendaModule={agendaModule} taskModule={taskModule} employees={employees.filter((entry) => entry.active)} currentUser={currentUser} busy={busy} canEdit={canEdit} canCreateTask={canCreateTask} onClose={() => { setSelected(null); const url = new URL(window.location.href); url.searchParams.delete("client"); url.searchParams.delete("card"); openedSharedCard.current = ""; window.history.replaceState({}, "", url); }} operate={operate} onSave={saveSelected} />}
    {creating && <ManualJourneyModal track={track} customers={customers} existingRecords={records} employees={employees.filter((entry) => entry.active)} statuses={statuses} defaultBaseFeatures={featureUniverse} currentUser={currentUser} busy={busy} onClose={() => setCreating(false)} onSave={async (payload) => { const result = await operate(payload, `Cliente inserido manualmente no acompanhamento de ${track === "activation" ? "ativação" : "retenção"}.`); if (result) setCreating(false); }} />}
  </section>;
}

function ManualJourneyModal({ track, customers, existingRecords, employees, statuses, defaultBaseFeatures, currentUser, busy, onClose, onSave }: { track: CsTrack; customers: Customer[]; existingRecords:Array<{item:WorkItem;journey:CsJourney}>; employees: Employee[]; statuses: string[]; defaultBaseFeatures: string[]; currentUser: CurrentUser; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [owner, setOwner] = useState(currentUser.displayName);
  const [phase, setPhase] = useState<CsPhase>("validation");
  const [status, setStatus] = useState(statuses[0] || "Pendente");
  const normalizedId=normalize(customerId.trim());
  const duplicate=Boolean(normalizedId&&existingRecords.some(({item,journey})=>normalize(journey.clientId||"")===normalizedId||normalize(item.customer_id||"")===normalizedId));
  const chooseCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((entry) => entry.id === id);
    if (!customer) return;
    setName(customer.trade_name || customer.legal_name);
    setPhone(customer.phone || "");
    setOwner(customer.cs_owner && customer.cs_owner !== "Não atribuído" ? customer.cs_owner : currentUser.displayName);
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if(duplicate)return;
    const journey: CsJourney = { kind: "csJourney", track, phase, clientId: customerId || undefined, commerciallyApproved: true, status, onboardingStartedAt: phase === "onboarding" ? now() : undefined, trackingStartedAt: phase === "tracking" ? now() : undefined, featuresBase: defaultBaseFeatures, featuresActive: [], featuresPlus: [], scoreEvolution: [], labels: [], follows: [{ kind: "Inserção manual", text: `Cliente inserido manualmente em ${PHASES.find((entry) => entry.id === phase)?.label}. Telefone: ${phone || "não informado"}.`, createdAt: now(), actor: currentUser.displayName }] };
    void onSave({ action: "createWorkItem", module: "cs", recordType: track === "activation" ? "Acompanhamento de ativação" : "Acompanhamento de retenção", title: name.trim(), customerId: customers.some((entry) => entry.id === customerId) ? customerId : null, customerName: name.trim(), owner, team: track === "activation" ? "Sucesso do Cliente · Ativação" : "Sucesso do Cliente · Retenção", priority: "P3", amountCents: 0, description: JSON.stringify(journey) });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal cs-manual-modal" role="dialog" aria-modal="true"><header className="modal-head"><div><span className="eyebrow">INSERÇÃO MANUAL</span><h2>Novo cliente em {track === "activation" ? "Ativação" : "Retenção"}</h2><p>Cadastre um cliente existente ou informe os dados manualmente.</p></div><button className="icon-button" type="button" onClick={onClose}><X size={18} /></button></header><form className="form-grid" onSubmit={submit}><label className="wide">Cliente cadastrado<select value={customers.some((entry) => entry.id === customerId) ? customerId : ""} onChange={(event) => chooseCustomer(event.target.value)}><option value="">Inserir dados manualmente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.trade_name} · {customer.id.slice(0, 8)}</option>)}</select></label><label>ID do cliente<input className={duplicate?"field-invalid":""} value={customerId} onChange={(event) => setCustomerId(event.target.value)} placeholder="ID interno ou código do cliente" />{duplicate&&<small className="duplicate-id-warning"><AlertTriangle size={13}/> ID já inserido na funcionalidade.</small>}</label><label>Cliente / empresa *<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>Responsável<select required value={owner} onChange={(event) => setOwner(event.target.value)}><option value={currentUser.displayName}>{currentUser.displayName}</option>{employees.filter((entry) => entry.displayName !== currentUser.displayName).map((employee) => <option key={employee.id}>{employee.displayName}</option>)}</select></label><label>Etapa inicial<select value={phase} onChange={(event) => setPhase(event.target.value as CsPhase)}><option value="validation">Validação</option><option value="onboarding">Onboarding</option><option value="tracking">Acompanhamento</option></select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || !name.trim() || duplicate}><Plus size={15} /> Inserir cliente</button></div></form></section></div>;
}

function ClipboardCheckIcon() { return <span className="cs-empty-icon"><CheckCircle2 size={24} /></span>; }

function JourneyCard({ item, journey, featureUniverse, commercial, employee, canEdit, canDelete, onOpen, onDelete }: { item: WorkItem; journey: CsJourney; featureUniverse: string[]; commercial?: WorkItem; employee?: Employee; canEdit: boolean; canDelete: boolean; onOpen: () => void; onDelete: () => void }) {
  const lead = commercial ? parseCommercial(commercial.description) : null;
  const score = healthScore(journey, featureUniverse);
  return <article className="cs-client-card" data-reminder-entity-id={item.id} data-reminder-client-id={journey.clientId} data-reminder-customer-name={item.title}>
    <button className="cs-client-card-main" onClick={onOpen}>
      <header><span><strong>{item.title}</strong>{journey.checkedAt && <CheckCircle2 size={15} aria-label="Dados conferidos" />}</span><b className={`cs-stage-pill ${phaseTone(journey.phase)}`}>{PHASES.find((entry) => entry.id === journey.phase)?.label}</b></header>
      <small>ID {journey.clientId || item.id.slice(0, 8)}</small>
      <div className="cs-card-owner" data-collaborator-name={item.owner}><span className={`cs-owner-avatar ${employee?.photoDataUrl ? "has-photo" : ""}`} style={employee?.photoDataUrl ? { backgroundImage: `url("${employee.photoDataUrl}")` } : undefined}>{!employee?.photoDataUrl && <UserRound size={11} />}</span>{item.owner || "Não atribuído"}</div>
      {lead?.phone && <div className="cs-card-phone"><Phone size={13} /> {lead.phone}</div>}
      {(journey.labels?.length ?? 0) > 0 && <div className="cs-card-labels" aria-label="Etiquetas vinculadas">{journey.labels.map((label) => <span key={label}>{label}</span>)}</div>}
      <div className="cs-card-progress"><span><small>Status</small><strong>{journey.status || "Pendente"}</strong></span>{journey.phase === "tracking" && <span><small>Dias</small><strong>{Math.min(trackedDays(journey, item), journey.track === "retention" ? 30 : 90)} / {journey.track === "retention" ? 30 : 90}</strong></span>}<span><small>Health</small><strong className={score >= 70 ? "good" : score >= 40 ? "warn" : "bad"}>{score}%</strong></span></div>
      {!isClosedCsJourney(journey.phase) && <div className={`cs-card-inactivity ${interactionDays(journey,item)>=5?"alert":""}`}><Clock3 size={13}/><strong>{interactionDays(journey,item)} dia(s)</strong> sem interação</div>}
      {journey.phase === "tracking" && <div className="cs-card-usage-chart" aria-label="Evolução de utilização">{trackingMilestones(journey.track).map(day => <span key={day} title={`D+${day}: ${journey.usageByDay?.[String(day)] || "Não informado"}`}><i style={{ height: `${Math.max(5, usagePercent(journey.usageByDay?.[String(day)]))}%` }} /><small>{day}</small></span>)}</div>}
      {journey.strategicAccount && <div className="cs-strategic-chip"><ShieldCheck size={13} /> Cliente estratégico</div>}
      {journey.cancellationPendingApproval && <div className="cs-cancellation-chip"><AlertTriangle size={13} /> Não convertido · em conferência</div>}
      {!journey.cancellationPendingApproval && journey.cancellationOutcome === "requested" && <div className="cs-cancellation-chip"><AlertTriangle size={13} /> Cliente solicitou cancelamento</div>}
      {journey.cancellationOutcome === "reverted" && <div className="cs-reverted-chip"><RotateCcw size={13} /> Cancelamento revertido</div>}
    </button>
    <footer><button onClick={onOpen}><MessageSquareText size={14} /> Gerenciar cliente</button>{canEdit && <button onClick={onOpen} aria-label="Editar cliente" title="Editar cliente"><Pencil size={14} /></button>}{canDelete && <button className="delete" onClick={onDelete} aria-label="Excluir cliente"><Trash2 size={14} /></button>}</footer>
  </article>;
}

function JourneyList({ records, sourceItems, featureUniverse, canDelete, onOpen, onDelete }: { records: Array<{ item: WorkItem; journey: CsJourney }>; sourceItems: WorkItem[]; featureUniverse: string[]; canDelete: boolean; onOpen: (item: WorkItem) => void; onDelete: (item: WorkItem) => void }) {
  return <section className="cs-client-table"><header><span>ID</span><span>CLIENTE</span><span>RESPONSÁVEL</span><span>STATUS</span><span>DIAS</span><span>HEALTH</span><span>AÇÕES</span></header>{records.map(({ item, journey }) => {
    const lead = parseCommercial(sourceItems.find((entry) => entry.id === journey.sourceLeadId)?.description || "");
    const score = healthScore(journey, featureUniverse);
    return <article data-reminder-entity-id={item.id} key={item.id}><span>{journey.clientId || item.id.slice(0, 8)}</span><span><strong>{item.title}</strong><small>{lead?.phone || item.customer_name}</small></span><span data-collaborator-name={item.owner}>{item.owner}</span><span><b className={`cs-stage-pill ${phaseTone(journey.phase)}`}>{journey.status || PHASES.find((entry) => entry.id === journey.phase)?.label}</b></span><span>{journey.phase === "tracking" ? `${Math.min(trackedDays(journey, item), journey.track === "retention" ? 30 : 90)} / ${journey.track === "retention" ? 30 : 90}` : "—"}</span><span className={score >= 70 ? "good" : score >= 40 ? "warn" : "bad"}>{score}%</span><span><button onClick={() => onOpen(item)} aria-label="Abrir cliente"><ExternalLink size={14} /></button>{canDelete && <button className="delete" onClick={() => onDelete(item)} aria-label="Excluir cliente"><Trash2 size={14} /></button>}</span></article>;
  })}</section>;
}

export function JourneyDrawer({ item, journey, commercialSource, catalogs, customers, agendaModule, taskModule, employees, currentUser, busy, canEdit, canCreateTask, distribution, strategicContext, onConferenceResolved, onClose, operate, onSave }: {
  item: WorkItem; journey: CsJourney; commercialSource?: WorkItem; catalogs: CatalogOption[]; customers: Customer[]; agendaModule: AgendaModuleData | null; taskModule: TaskModuleData | null;
  employees: Employee[]; currentUser: CurrentUser; busy: boolean; canEdit: boolean; canCreateTask: boolean; onClose: () => void;
  distribution?: ClientDistribution;
  strategicContext?: { networkId: string; networkName: string; unitId: string; unitName: string };
  onConferenceResolved?: (phase: Extract<CsPhase, "onboarding" | "tracking" | "finished" | "unsuccessful" | "cancelled" | "cancelledWithoutTraining">, status: string) => Promise<void>;
  operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onSave: (payload: Record<string, unknown>, success?: string) => Promise<OperationResult>;
}) {
  const commercial = commercialSource ? parseCommercial(commercialSource.description) : null;
  const isStrategic = journey.strategicAccount || Boolean(strategicContext);
  const [responsible, setResponsible] = useState(item.owner || "");
  const detectedVersion = distribution?.pendingClients.find(client => client.workItemId === item.id)?.version ?? "";
  const [selectedDistributionVersion, setSelectedDistributionVersion] = useState("");
  const clientDistributionVersion = selectedDistributionVersion || (detectedVersion !== unknownClientVersion ? detectedVersion : "");
  const clientDistributionQueue = distributionQueue(distribution, clientDistributionVersion);
  const [validationResponsibleId, setValidationResponsibleId] = useState("");
  const [manualRecipient, setManualRecipient] = useState(false);
  useEffect(() => {
    if (journey.phase === "validation" && !manualRecipient) setValidationResponsibleId(clientDistributionQueue?.suggestedUserId ?? "");
  }, [journey.phase, manualRecipient, clientDistributionQueue?.suggestedUserId]);
  const rotationWarning = distributionWarning(distribution, clientDistributionVersion, validationResponsibleId);
  const [status, setStatus] = useState(journey.status || "Pendente");
  const [usage, setUsage] = useState(journey.usage || "");
  const [callStatus, setCallStatus] = useState(journey.callStatus || "");
  const [firstMeeting, setFirstMeeting] = useState((journey.firstMeetingAt || journey.scheduledAt || "").slice(0, 10));
  const [firstMeetingTime, setFirstMeetingTime] = useState(journey.firstMeetingTime || (journey.scheduledAt?.slice(11, 16) ?? "09:30"));
  const [training, setTraining] = useState((journey.trainingAt || "").slice(0, 10));
  const [trainingTime, setTrainingTime] = useState(journey.trainingTime || "09:30");
  const [singleAlignmentEnabled, setSingleAlignmentEnabled] = useState(Boolean(journey.singleAlignmentAt || journey.singleAlignmentCompletedAt));
  const [singleAlignment, setSingleAlignment] = useState((journey.singleAlignmentAt || "").slice(0, 10));
  const [singleAlignmentTime, setSingleAlignmentTime] = useState(journey.singleAlignmentTime || "09:30");
  const [meetingLink, setMeetingLink] = useState(journey.meetingLink || "");
  const allFeatureOptions = catalogs.filter((entry, index, entries) => ["csFeature", "csFeatureBase", "csFeatureActive", "csFeaturePlus"].includes(entry.catalog) && entries.findIndex((candidate) => normalize(candidate.name) === normalize(entry.name)) === index);
  const defaultBaseFeatures = featureTokens(catalogs.filter((entry) => ["csFeature", "csFeatureBase", "csFeatureActive", "csFeaturePlus"].includes(entry.catalog) && catalogFeatureIsBase(entry)).map((entry) => entry.name));
  const [featuresBase, setFeaturesBase] = useState(journey.featuresBase.length ? journey.featuresBase : defaultBaseFeatures);
  const [featuresActive, setFeaturesActive] = useState(journey.featuresActive);
  const [featuresPlus, setFeaturesPlus] = useState(journey.featuresPlus);
  const [labels, setLabels] = useState(journey.labels);
  const [usageByDay, setUsageByDay] = useState<Record<string, string>>(journey.usageByDay || {});
  const [comment, setComment] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [taskEditor, setTaskEditor] = useState(false);

  const options = (catalog: string) => catalog === "csFeatureBase"
    ? allFeatureOptions.filter(catalogFeatureIsBase)
    : catalog === "csFeaturePlus"
      ? plusFeatureOptions
      : catalogs.filter((entry) => entry.catalog === catalog);
  const activeFeatureOptions = allFeatureOptions;
  const plusFeatureOptions = allFeatureOptions.filter((entry) => !featuresBase.some((feature) => normalize(feature) === normalize(entry.name)));
  const workflowStatuses = [...new Set([...options("csWorkflowStatus").map((entry) => entry.name), ...options("csFinalStatus").map((entry) => entry.name), ...DEFAULT_STATUSES])];
  const phaseName = PHASES.find((entry) => entry.id === journey.phase)?.label || "Jornada";
  const commercialKickoffAt = journey.sourceLeadId && journey.scheduledAt ? journey.scheduledAt : "";
  const score = healthScore({ ...journey, featuresBase, featuresActive, featuresPlus }, defaultBaseFeatures);
  const milestones = trackingMilestones(journey.track);
  const append = (next: CsJourney, message: string, kind = "Atualização") => ({ ...next, follows: [...next.follows, { text: message, createdAt: now(), actor: currentUser.displayName, kind }] });
  const save = (next: CsJourney, message: string, owner = item.owner, kind = "Atualização") => onSave({ owner, description: JSON.stringify(append(next, message, kind)) }, message);
  const [savingEvolution, setSavingEvolution] = useState(false);
  const [evolutionSaveState, setEvolutionSaveState] = useState<"idle" | "saved" | "error">("idle");
  const persistEvolution = async (patch: Partial<CsJourney>) => {
    if (!canEdit || busy || savingEvolution) return;
    const previous = { status, usage, callStatus, featuresBase, featuresActive, featuresPlus, labels, usageByDay };
    const next = { ...previous, ...patch };
    const display = (value: typeof previous) => {
      setStatus(value.status); setUsage(value.usage); setCallStatus(value.callStatus);
      setFeaturesBase(value.featuresBase); setFeaturesActive(value.featuresActive);
      setFeaturesPlus(value.featuresPlus); setLabels(value.labels); setUsageByDay(value.usageByDay);
    };
    display(next);
    setSavingEvolution(true);
    setEvolutionSaveState("idle");
    try {
      const previousScore = healthScore({ ...journey, ...previous }, defaultBaseFeatures);
      const nextScore = healthScore({ ...journey, ...next }, defaultBaseFeatures);
      const featureChanged = ["featuresBase", "featuresActive", "featuresPlus"].some((key) => Object.prototype.hasOwnProperty.call(patch, key));
      const createdAt = now();
      const summary = featureChanged
        ? `Score atualizado de ${previousScore}% para ${nextScore}%. Base: ${next.featuresBase.length}; em uso: ${next.featuresActive.length}; Plus: ${next.featuresPlus.length}.`
        : "Evolução operacional atualizada automaticamente.";
      const scoreEvolution = featureChanged ? [...(journey.scoreEvolution ?? []), { id: crypto.randomUUID(), createdAt, actor: currentUser.displayName, period: createdAt.slice(0, 7), score: nextScore, previousScore, featuresBase: next.featuresBase, featuresActive: next.featuresActive, featuresPlus: next.featuresPlus, summary, kind: "Evolução de score" as const }] : journey.scoreEvolution;
      const result = await save({ ...journey, ...next, scoreEvolution }, summary, item.owner);
      if (!result) { display(previous); setEvolutionSaveState("error"); }
      else setEvolutionSaveState("saved");
    } catch {
      display(previous); setEvolutionSaveState("error");
    } finally { setSavingEvolution(false); }
  };
  const [handoffError, setHandoffError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const changeResponsible = async (ownerName: string, advanceToOnboarding = false) => {
    setHandoffError("");
    const suggestedRecipient = advanceToOnboarding ? distribution?.collaborators.find(entry => entry.userId === validationResponsibleId) : undefined;
    const employee = suggestedRecipient ? { id: suggestedRecipient.userId, displayName: suggestedRecipient.displayName } : employees.find((entry) => normalize(entry.displayName) === normalize(ownerName));
    if (!employee) { setHandoffError("Selecione um responsável ativo."); return false; }
    const next = advanceToOnboarding ? { ...journey, phase: "onboarding" as const, status: "Onboarding", onboardingStartedAt: now() } : journey;
    const message = advanceToOnboarding ? "Cliente encaminhado para onboarding e compromisso transferido na agenda." : `Responsável alterado para ${employee.displayName}; compromissos vinculados atualizados.`;
    const result = await onSave({ owner: employee.displayName, responsibleUserId: employee.id, description: JSON.stringify(append(next, message)),
      ...(advanceToOnboarding && distribution ? { distributionVersion: clientDistributionVersion, expectedNextResponsibleUserId: clientDistributionQueue?.suggestedUserId } : {}) }, message);
    if (!result) setHandoffError("Não foi possível encaminhar. Verifique o aviso da operação e tente novamente.");
    return result;
  };
  const sendToConference = () => {
    const nextLabels = isStrategic ? [...new Set([...labels, "Cliente estratégico"])] : labels;
    return save({ ...requestCsConference(journey, now()), featuresBase, featuresActive, featuresPlus, labels: nextLabels, usage, callStatus, usageByDay,
      ...(strategicContext ? { strategicAccount: true, strategicNetworkId: strategicContext.networkId, strategicNetworkName: strategicContext.networkName, strategicUnitId: strategicContext.unitId, strategicUnitName: strategicContext.unitName } : {}) }, "Cliente enviado para conferência.");
  };
  const copyJourneyLink = async () => {
    try { await navigator.clipboard.writeText(cardShareUrl("cs", item.id, { csFlow: journey.track === "retention" ? "evolution" : "onboarding" })); setLinkCopied(true); }
    catch { setLinkCopied(false); }
  };

  const schedule = async (kind: "Kick off" | "Treinamento" | "Alinhamento único", date: string, time: string, key: "firstMeetingCommitmentId" | "trainingCommitmentId" | "singleAlignmentCommitmentId") => {
    if (!agendaModule || !date) return false;
    const calendar = agendaModule.calendars.find((entry) => /sucesso do cliente|ativa[cç][aã]o|cs/i.test(`${entry.name} ${entry.departmentName}`)) ?? agendaModule.calendars.find((entry) => entry.active);
    const type = agendaModule.types.find((entry) => entry.active);
    const agendaStatus = agendaModule.statuses.find((entry) => entry.active);
    const collaborator = agendaModule.collaborators.find((entry) => entry.name === responsible) ?? agendaModule.collaborators.find((entry) => entry.name === item.owner) ?? agendaModule.collaborators.find((entry) => entry.departmentId === calendar?.departmentId);
    if (!calendar || !type || !agendaStatus || !collaborator) return false;
    const startsAt = new Date(`${date}T${time || "09:30"}:00`).toISOString();
    const result = await operate({ action: "createAgendaCommitment", agendaId: calendar.id, agendaTypeId: type.id, agendaStatusId: agendaStatus.id, responsibleUserId: collaborator.id, title: `${kind} · ${item.title}`, description: `Cliente ${journey.clientId || item.customer_name || item.title}${meetingLink ? `. Link: ${meetingLink}` : ""}`, startsAt, endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(), participantUserIds: [], recurrence: "none" }, `${kind} agendado e adicionado à agenda de ${collaborator.name}.`);
    if (!result) return false;
    const scheduleData = kind === "Kick off" ? { firstMeetingAt: startsAt, firstMeetingTime: time, meetingLink }
      : kind === "Treinamento" ? { trainingAt: startsAt, trainingTime: time }
      : { singleAlignmentAt: startsAt, singleAlignmentTime: time };
    await save({ ...journey, [key]: result.id, ...scheduleData }, `${kind} agendado para ${dateOnly(startsAt)} às ${time}.`);
    return true;
  };

  const requestCancellation = async (detail: CancellationDetail) => {
    const selectedCustomer = customers.find((entry) => entry.id === detail.clientId || entry.id === item.customer_id);
    const result = await operate({ action: "createWorkItem", module: "cancellations", recordType: "Solicitação de cancelamento", title: detail.customerName || `Cancelamento · ${detail.clientId}`, customerId: selectedCustomer?.id || null, customerName: detail.customerName, owner: detail.csOwner || item.owner, team: "Reversão de cancelamentos", status: "Fila de espera", priority: "P1", amountCents: detail.monthlyValueCents, originType: "cs", originId: item.id, description: JSON.stringify(detail) }, "Cancelamento incluído na fila de espera.");
    if (!result) return false;
    const link = `/?mod=cancellations&cancellation=${encodeURIComponent(result.id || "")}`;
    const saved = await save({ ...journey, cancellationRequestedAt: now(), cancellationRequestedBy: currentUser.displayName, cancellationTaskId: result.id, cancellationTaskProtocol: detail.clientId, cancellationTaskLink: link, cancellationOutcome: "requested" }, `Cliente solicitou cancelamento. Registro encaminhado à fila de reversão.`, item.owner);
    if (saved) setTaskEditor(false);
    return saved;
  };

  const sourceHistory: HistoryEntry[] = Array.isArray(commercial?.follows) ? commercial.follows.map((entry) => ({ text: entry.text || "Interação comercial", createdAt: entry.createdAt || commercialSource?.created_at || item.created_at, actor: entry.author || commercial?.seller, kind: "Comercial" })) : [];
  const history = [...sourceHistory, ...journey.follows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const onboardingReady = Boolean(journey.singleAlignmentCompletedAt || (journey.firstMeetingCompletedAt && journey.trainingCompletedAt));
  const journeyCustomer = customers.find((entry) => entry.id === item.customer_id || entry.id === journey.clientId || entry.document_masked?.replace(/\D/g, "") === String(journey.clientId || "").replace(/\D/g, ""));
  const notifyConferenceResult = async (destination: string) => {
    const employee = employees.find((entry) => normalize(entry.displayName) === normalize(item.owner));
    if (!employee) return false;
    return operate({ action: "saveNotice", title: `Acompanhamento finalizado · ${item.title}`, body: `A conferência de ${item.title} foi finalizada.\nCliente movido para: ${destination}.\nID: ${journey.clientId || item.customer_id || item.id.slice(0, 8)}\nMotivo: ${decisionReason.trim()}`, noticeType: "Importante", noticeKind: "Aviso", audience: "Colaborador", targetUserId: employee.id, active: true }, `Aviso de finalização enviado para ${employee.displayName}.`);
  };
  const moveFromConference = async (phase: Extract<CsPhase, "onboarding" | "tracking" | "finished" | "unsuccessful" | "cancelled" | "cancelledWithoutTraining">, statusLabel: string) => {
    const at = now();
    if (phase === "tracking" && journey.conferenceFromPhase === "onboarding") { phase = "onboarding"; statusLabel = "Onboarding"; }
    const cancelled = phase === "cancelled" || phase === "cancelledWithoutTraining";
    const next: CsJourney = {
      ...journey,
      phase,
      status: statusLabel,
      conferenceConfirmedAt: at,
      cancellationPendingApproval: false,
      ...(["tracking", "onboarding"].includes(phase) ? { rejectionReason: decisionReason.trim() } : {}),
      ...(phase === "finished" ? { approvalReason: decisionReason.trim() } : {}),
      ...(phase === "unsuccessful" ? { finalReason: decisionReason.trim() } : {}),
      ...(cancelled ? { cancellationOutcome: "cancelled" as const, cancellationReason: decisionReason.trim(), cancellationResolvedAt: at } : {}),
    };
    const saved = await save(next, `Conferência finalizada. Cliente movido para ${statusLabel}: ${decisionReason.trim()}`);
    if (!saved) return;
    await onConferenceResolved?.(phase, statusLabel);
    if (journeyCustomer) await operate({ action: "updateCustomer", id: journeyCustomer.id, status: cancelled ? "Cancelado" : "Cliente" }, cancelled ? "Cliente marcado como CANCELADO." : "Cadastro do cliente mantido ativo.");
    await notifyConferenceResult(statusLabel);
  };
  const resolveCommercialCancellation = async (approved: boolean) => {
    const at = now();
    const next: CsJourney = approved
      ? { ...journey, phase: "cancelled", status: "Cancelado", cancellationPendingApproval: false, cancellationOutcome: "cancelled", cancellationResolvedAt: at, approvalReason: decisionReason.trim(), conferenceConfirmedAt: at }
      : { ...journey, phase: "tracking", status: "Em acompanhamento", cancellationPendingApproval: false, cancellationOutcome: "reverted", cancellationResolvedAt: at, rejectionReason: decisionReason.trim(), conferenceConfirmedAt: at };
    const message = approved ? `Cancelamento aprovado pela coordenação: ${decisionReason.trim()}` : `Cancelamento reprovado pela coordenação; acompanhamento retomado: ${decisionReason.trim()}`;
    const saved = await save(next, message);
    if (saved && journeyCustomer) await operate({ action: "updateCustomer", id: journeyCustomer.id, status: approved ? "Cancelado" : "Cliente" }, approved ? "Cliente movido para Cancelados." : "Cliente mantido em acompanhamento.");
    if (saved) await notifyConferenceResult(approved ? "Cancelados" : "Acompanhamento");
  };
  const resumeInValidation = async () => {
    if (!canEdit || busy || !canResumeCsJourney(journey.phase)) return;
    const saved = await save(resumeCsJourney(journey, now(), currentUser.displayName), "Cliente retomado para validação. Um novo ciclo foi iniciado com o histórico preservado.");
    if (saved && journeyCustomer) await operate({ action: "updateCustomer", id: journeyCustomer.id, status: "Cliente" }, "Cadastro do cliente reativado para acompanhamento.");
    if (saved) onClose();
  };
  const resumeInRetention = async () => {
    const configured = catalogs.filter((entry) => entry.catalog === "funnelStage").map((entry) => {
      try {
        const detail = JSON.parse(entry.description || "{}") as { f?: string; functionality?: string; s?: unknown[][]; stages?: Array<{ name?: string }> };
        const stages = Array.isArray(detail.s) ? detail.s.map((stage) => String(stage[0] || "")).filter(Boolean) : Array.isArray(detail.stages) ? detail.stages.map((stage) => String(stage.name || "")).filter(Boolean) : [];
        return { entry, retention: detail.f === "r" || detail.functionality === "CRM Retenção", stages };
      } catch { return { entry, retention: false, stages: [] as string[] }; }
    }).find((entry) => entry.retention);
    const funnelName = configured?.entry.name || "CRM Retenção";
    const firstStage = configured?.stages[0] || "Em espera";
    const createdAt = now();
    const lead = { kind: "commercialLead", phone: commercial?.phone || "", source: "Acompanhamento Retenção", seller: item.owner, funnel: funnelName, stage: firstStage, temperature: "", labels: [], products: commercial?.products || [], score: 0, entryDate: createdAt.slice(0, 10), customer: item.customer_name || item.title, clientId: journey.clientId || "", version: customers.find((entry) => entry.id === item.customer_id)?.product_version || "", sourceJourneyId: item.id, retentionStatus: "Retomado do acompanhamento", retentionMarks: [], comments: [], follows: [{ type: "Retomada", text: `Card copiado do Acompanhamento Retenção finalizado para a primeira coluna (${firstStage}) do CRM Retenção.`, createdAt, author: currentUser.displayName }] };
    const copied = await operate({ action: "createWorkItem", module: "commercial", recordType: "Lead de retenção", title: item.title, customerId: item.customer_id, customerName: item.customer_name || item.title, owner: item.owner, team: "CRM Retenção", priority: "P2", amountCents: item.amount_cents, originType: "cs", originId: item.id, description: JSON.stringify(lead) }, "Cópia criada na primeira coluna do CRM Retenção.");
    if (!copied) return;
    await save({ ...journey, status: "Cliente no CRM Retenção" }, `Cliente retomado no CRM Retenção. Cópia ${copied.id || "criada"} inserida na etapa ${firstStage}.`);
  };

  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer cs-pipeline-drawer" data-reminder-source-module="cs" data-reminder-source-entity-id={item.id} data-reminder-source-client-id={journey.clientId} data-reminder-source-customer-name={item.customer_name || item.title} data-reminder-source-title={item.title}>
    <header className="cs-drawer-head"><div><span className="eyebrow">{phaseName.toUpperCase()}</span><h2>{item.title} {journey.checkedAt && <CheckCircle2 size={18} />}</h2><p>Cliente ID {journey.clientId || item.id.slice(0, 8)} · {item.customer_name || "Cadastro comercial"}</p></div><div className="cs-drawer-head-actions"><button type="button" className="card-copy-link cs-copy-link" onClick={() => void copyJourneyLink()}><Copy size={15} /><b>{linkCopied ? "Link copiado" : "Copiar link"}</b></button><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div></header>

    <div className="cs-drawer-content">
      {handoffError && <p className="cs-handoff-error" role="alert">{handoffError}</p>}
      {journey.status === "Cliente no CRM Retenção" && <section className="cs-retention-active-banner"><RotateCcw /><span><strong>Cliente está no CRM Retenção</strong><small>O card foi copiado para nova tratativa. Ao concluir o contato com sucesso, esta jornada voltará automaticamente para Onboarding.</small></span></section>}
      <section className="cs-client-overview">
        <div><UserRound size={15} /><span><small>Responsável</small><strong>{item.owner || "Não atribuído"}</strong></span></div>
        <div><Phone size={15} /><span><small>Telefone</small><strong>{commercial?.phone || "Não informado"}</strong></span></div>
        <div><Clock3 size={15} /><span><small>Dias em acompanhamento</small><strong>{trackedDays(journey, item)} dias</strong></span></div>
        {!['finished','cancelled','cancelledWithoutTraining'].includes(journey.phase) && <div><Clock3 size={15} /><span><small>Sem interação</small><strong>{interactionDays(journey,item)} dia(s)</strong></span></div>}
        <div><Activity size={15} /><span><small>Health Score</small><strong className={score >= 70 ? "good" : score >= 40 ? "warn" : "bad"}>{score}%</strong></span></div>
        {commercialSource && <a href={`/?mod=commercial&commercialFlow=crm&lead=${encodeURIComponent(commercialSource.id)}`}><Link2 size={14} /> Abrir CRM</a>}
      </section>

      {canEdit && journey.phase !== "validation" && !isClosedCsJourney(journey.phase) && <section className="cs-owner-assignment"><label>Alterar responsável<select value={responsible} onChange={(event) => setResponsible(event.target.value)}><option value="">Selecione o responsável</option>{employees.map((employee) => <option key={employee.id} value={employee.displayName}>{employee.displayName} · {employee.departmentName}</option>)}</select></label><button type="button" className="secondary-button" disabled={busy || !responsible || responsible === item.owner} onClick={() => void changeResponsible(responsible)}><UserRound size={15} /> Atualizar responsável e agenda</button></section>}

      <CancellationPanel journey={journey} canEdit={canEdit} canCreateTask={canCreateTask} busy={busy} onRequest={() => setTaskEditor(true)} />

      <JourneyTimeline current={journey.phase} />
      {journey.phase === "conference" && isStrategic && <div className="cs-strategic-conference-notice"><ShieldCheck size={17} /><span><strong>Cliente estratégico</strong><small>{journey.strategicNetworkName || strategicContext?.networkName || "Conta estratégica"} · {journey.strategicUnitName || strategicContext?.unitName || item.title}</small></span></div>}

      {commercial && <section className="cs-drawer-panel"><header><span className="eyebrow">ORIGEM COMERCIAL</span><h3>Informações e interações preservadas</h3></header><div className="cs-info-grid"><span><small>Origem</small><strong>{commercial.source || "Não informada"}</strong></span><span><small>Vendedor</small><strong>{commercial.seller || commercialSource?.owner || "Não informado"}</strong></span><span><small>Temperatura</small><strong>{commercial.temperature || "Não definida"}</strong></span><span><small>Produtos</small><strong>{commercial.products?.length || 0}</strong></span></div></section>}

      {journey.phase === "validation" && <section className="cs-drawer-panel cs-validation-panel">
        <header><span className="eyebrow">VALIDAÇÃO</span><h3>Conferir dados e encaminhar</h3><p>Confirme os dados e consulte a fila da versão antes de atribuir o onboarding. Os compromissos serão transferidos para a agenda do responsável escolhido.</p></header>
        {distribution && <>
          <label className="cs-distribution-version-picker">Versão do cliente para o rodízio<select aria-label="Versão do cliente para o rodízio" value={clientDistributionVersion} disabled={!canEdit||busy} onChange={event=>{setSelectedDistributionVersion(event.target.value);setManualRecipient(false);}}><option value="">Informe a versão do cliente</option>{distribution.queues.filter(queue=>queue.version!==unknownClientVersion).map(queue=><option key={queue.version}>{queue.version}</option>)}</select><small>{detectedVersion&&detectedVersion!==unknownClientVersion?"Versão identificada no cadastro do cliente ou na venda. A versão selecionada ficará registrada neste envio.":"A versão não foi identificada. Selecione a versão antes de encaminhar."}</small></label>
          <CsDistributionPanel compact board={distribution} version={clientDistributionVersion} onUseSuggested={()=>{setValidationResponsibleId(clientDistributionQueue?.suggestedUserId??"");setManualRecipient(false);}} />
        </>}
        <div className="cs-validation-actions"><button className={journey.checkedAt ? "secondary-button success-action" : "secondary-button"} disabled={!canEdit || busy || Boolean(journey.checkedAt)} onClick={() => void save({ ...journey, status, checkedAt: now(), checkedBy: currentUser.displayName }, "Dados comerciais conferidos.")}><Check size={16} /> {journey.checkedAt ? "Conferido em "+dateOnly(journey.checkedAt) : "Conferir dados"}</button>
        <label>Encaminhar para<select aria-label="Encaminhar cliente para colaborador" value={distribution?validationResponsibleId:responsible} disabled={!canEdit||busy} onChange={event=>{if(distribution){setValidationResponsibleId(event.target.value);setManualRecipient(true);}else setResponsible(event.target.value);}}><option value="">Selecione o responsável</option>{distribution?distribution.collaborators.map(employee=><option key={employee.userId} value={employee.userId}>{employee.displayName} · {employee.clientsByVersion[clientDistributionVersion]??0} desta versão · {employee.totalClients} distribuídos</option>):employees.map(employee=><option key={employee.id} value={employee.displayName}>{employee.displayName} · {employee.departmentName}</option>)}</select></label>
        <button className="primary-button" disabled={!canEdit || busy || !journey.checkedAt || (distribution?!clientDistributionVersion||!validationResponsibleId:!responsible)} onClick={() => void changeResponsible(responsible, true)}><ArrowRight size={16} /> Encaminhar</button></div>
        {rotationWarning&&<div className="cs-distribution-warning" role="status"><AlertTriangle size={18}/><span><strong>Atenção ao rodízio</strong><p>{rotationWarning}</p></span></div>}
      </section>}

      {journey.phase === "onboarding" && <section className="cs-drawer-panel">
        <header><span className="eyebrow">ONBOARDING</span><h3>Kick off e treinamento</h3><p>Conclua Kick off e Treinamento ou utilize um Alinhamento único para avançar.</p></header>
        <div className="cs-schedule-grid"><label>Kick off<input type="date" value={firstMeeting} disabled={!canEdit} onChange={(event) => setFirstMeeting(event.target.value)} /></label><label>Horário<input type="time" value={firstMeetingTime} disabled={!canEdit} onChange={(event) => setFirstMeetingTime(event.target.value)} /></label>{commercialKickoffAt && <div className="cs-commercial-kickoff-notice"><CheckCircle2 size={16} /><span><strong>Agendado pelo Comercial</strong><small>{dateOnly(commercialKickoffAt)} às {journey.firstMeetingTime || commercialKickoffAt.slice(11, 16)}</small></span></div>}<label className="wide">Link da reunião<input type="url" value={meetingLink} disabled={!canEdit} onChange={(event) => setMeetingLink(event.target.value)} placeholder="https://meet.google.com/..." /></label><button className="secondary-button" disabled={!canEdit || busy || !firstMeeting || Boolean(journey.firstMeetingCommitmentId)} onClick={() => void schedule("Kick off", firstMeeting, firstMeetingTime, "firstMeetingCommitmentId")}><CalendarDays size={15} /> {journey.firstMeetingCommitmentId ? "Kick off na agenda" : "Agendar Kick off"}</button><button className={journey.firstMeetingCompletedAt ? "secondary-button success-action" : "secondary-button"} disabled={!canEdit || busy || !firstMeeting || Boolean(journey.firstMeetingCompletedAt)} onClick={() => void save({ ...journey, firstMeetingAt: `${firstMeeting}T${firstMeetingTime || "09:30"}:00`, firstMeetingTime, meetingLink, firstMeetingCompletedAt: now() }, "Kick off realizado.")}><Check size={15} /> {journey.firstMeetingCompletedAt ? "Kick off realizado" : "Marcar Kick off realizado"}</button></div>
        <div className="cs-schedule-grid"><label>Treinamento<input type="date" value={training} disabled={!canEdit || singleAlignmentEnabled} onChange={(event) => setTraining(event.target.value)} /></label><label>Horário<input type="time" value={trainingTime} disabled={!canEdit || singleAlignmentEnabled} onChange={(event) => setTrainingTime(event.target.value)} /></label><span className="wide" /><button className="secondary-button" disabled={!canEdit || busy || singleAlignmentEnabled || !training || Boolean(journey.trainingCommitmentId)} onClick={() => void schedule("Treinamento", training, trainingTime, "trainingCommitmentId")}><CalendarDays size={15} /> {journey.trainingCommitmentId ? "Treinamento na agenda" : "Agendar treinamento"}</button><button className={journey.trainingCompletedAt ? "secondary-button success-action" : "secondary-button"} disabled={!canEdit || busy || singleAlignmentEnabled || !training || Boolean(journey.trainingCompletedAt)} onClick={() => void save({ ...journey, trainingAt: `${training}T${trainingTime || "09:30"}:00`, trainingTime, trainingCompletedAt: now() }, "Treinamento realizado.")}><Check size={15} /> {journey.trainingCompletedAt ? "Treinamento realizado" : "Marcar treinamento realizado"}</button></div>
        <section className={`cs-single-alignment${singleAlignmentEnabled ? " enabled" : ""}`}><label className="checkbox-label"><input type="checkbox" checked={singleAlignmentEnabled} disabled={!canEdit || Boolean(journey.singleAlignmentCompletedAt)} onChange={(event) => setSingleAlignmentEnabled(event.target.checked)} /><span><strong>Alinhamento único</strong><small>Substitui Kick off e Treinamento quando realizado em uma única reunião.</small></span></label>{singleAlignmentEnabled && <div className="cs-schedule-grid"><label>Data do alinhamento<input type="date" value={singleAlignment} disabled={!canEdit} onChange={(event) => setSingleAlignment(event.target.value)} /></label><label>Horário<input type="time" value={singleAlignmentTime} disabled={!canEdit} onChange={(event) => setSingleAlignmentTime(event.target.value)} /></label><span className="wide" /><button className="secondary-button" disabled={!canEdit || busy || !singleAlignment || !singleAlignmentTime || Boolean(journey.singleAlignmentCommitmentId)} onClick={() => void schedule("Alinhamento único", singleAlignment, singleAlignmentTime, "singleAlignmentCommitmentId")}><CalendarDays size={15} /> {journey.singleAlignmentCommitmentId ? "Alinhamento na agenda" : "Agendar alinhamento"}</button><button className={journey.singleAlignmentCompletedAt ? "secondary-button success-action" : "secondary-button"} disabled={!canEdit || busy || !singleAlignment || !singleAlignmentTime || Boolean(journey.singleAlignmentCompletedAt)} onClick={() => void save({ ...journey, singleAlignmentAt: `${singleAlignment}T${singleAlignmentTime}:00`, singleAlignmentTime, meetingLink, singleAlignmentCompletedAt: now() }, "Alinhamento único realizado.")}><Check size={15} /> {journey.singleAlignmentCompletedAt ? "Alinhamento concluído" : "Marcar alinhamento concluído"}</button></div>}</section>
        <div className="cs-stage-forward"><span>{onboardingReady ? "Pré-requisitos concluídos. Cliente pronto para acompanhamento." : "Conclua Kick off e Treinamento ou o Alinhamento único para liberar o encaminhamento."}</span><div className="cs-stage-forward-actions"><button type="button" className="secondary-button" disabled={!canEdit || busy || savingEvolution} onClick={() => void sendToConference()}><Send size={16} /> Enviar para conferência</button><button className="primary-button" disabled={!canEdit || busy || !onboardingReady} onClick={() => void save({ ...journey, phase: "tracking", status: "Em acompanhamento", trackingStartedAt: now() }, "Cliente encaminhado para acompanhamento.")}><ArrowRight size={16} /> Encaminhar para acompanhamento</button></div></div>
      </section>}

      {journey.phase === "tracking" && <section className="cs-drawer-panel"><header><span className="eyebrow">ACOMPANHAMENTO</span><h3>Utilização, features e evolução</h3><p>{trackedDays(journey, item)} dias em acompanhamento · Health Score {score}%.</p></header><div className="cs-info-grid cs-edit-grid"><label>Status<select value={status} disabled={!canEdit || busy || savingEvolution} onChange={(event) => void persistEvolution({ status: event.target.value })}>{workflowStatuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Status de uso<select value={usage} disabled={!canEdit || busy || savingEvolution} onChange={(event) => void persistEvolution({ usage: event.target.value })}><option value="">Selecione</option>{options("csUsage").map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><label>Status de ligação<select value={callStatus} disabled={!canEdit || busy || savingEvolution} onChange={(event) => void persistEvolution({ callStatus: event.target.value })}><option value="">Selecione</option>{options("csCallStatus").map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label></div><section className="cs-feature-board"><header><div><span className="eyebrow">FEATURES</span><h3>Aderência do cliente</h3><p>Selecione várias opções. O score compara a base contratada com as funcionalidades efetivamente em uso.</p></div><strong className={score >= 70 ? "good" : score >= 40 ? "warn" : "bad"}>Health Score: {score}%</strong></header><FeaturePicker label="BASE CONTRATADA" options={options("csFeatureBase")} selected={featuresBase} onChange={value => void persistEvolution({ featuresBase: value })} disabled={!canEdit || busy || savingEvolution} /><FeaturePicker label="EM USO" options={activeFeatureOptions} selected={featuresActive} onChange={value => void persistEvolution({ featuresActive: value })} disabled={!canEdit || busy || savingEvolution} /><FeaturePicker label="PLUS" options={options("csFeaturePlus")} selected={featuresPlus} onChange={value => void persistEvolution({ featuresPlus: value })} disabled={!canEdit || busy || savingEvolution} /></section><FeaturePicker label="ETIQUETAS" options={options("csLabel")} selected={labels} onChange={value => void persistEvolution({ labels: value })} disabled={!canEdit || busy || savingEvolution} /><div className="cs-growth"><header><span>Evolução da utilização · {milestones.at(-1)} dias</span><strong>{score}% health</strong></header><UsageLineChart milestones={milestones} usageByDay={usageByDay} /></div><section className="cs-usage-routine"><header><div><span className="eyebrow">ROTINA DE ACOMPANHAMENTO</span><h3>Status de utilização por dia</h3></div><small>Cada seleção atualiza o gráfico imediatamente e fica registrada na evolução.</small></header><div>{milestones.map(day=><label key={day}><span>D+{day}</span><select value={usageByDay[String(day)]||""} disabled={!canEdit || busy || savingEvolution} onChange={event=>void persistEvolution({ usageByDay: {...usageByDay, [String(day)]:event.target.value} })}><option value="">Selecione</option>{(options("csUsage").length?options("csUsage").map(entry=>entry.name):["Utilizando","Parcialmente","Não utilizando"]).map(entry=><option key={entry}>{entry}</option>)}</select></label>)}</div></section><p className={`cs-autosave-status ${evolutionSaveState}`} role="status">{savingEvolution ? "Salvando evolução..." : evolutionSaveState === "saved" ? "Alterações salvas automaticamente." : evolutionSaveState === "error" ? "Não foi possível salvar. Tente selecionar novamente." : "As seleções são salvas automaticamente."}</p><div className="cs-stage-forward"><button className="primary-button" disabled={!canEdit || busy || savingEvolution} onClick={() => void sendToConference()}><Send size={16} /> Enviar para conferência</button></div></section>}

      {journey.phase === "conference" && <section className="cs-drawer-panel cs-conference-panel"><header><span className="eyebrow">CONFERÊNCIA</span><h3>{journey.cancellationPendingApproval ? "Validar não conversão comercial" : "Análise completa da jornada"}</h3><p>{journey.cancellationPendingApproval ? "O Comercial não converteu a reversão. Confira o motivo antes de mover o cliente para Cancelados." : "Confira o histórico, Health Score e evidências antes da decisão."}</p></header><div className="cs-decision-summary"><span><small>Kick off</small><strong>{journey.firstMeetingCompletedAt ? `Realizado ${dateOnly(journey.firstMeetingCompletedAt)}` : journey.singleAlignmentCompletedAt ? "Substituído pelo alinhamento" : "Pendente"}</strong></span><span><small>Treinamento</small><strong>{journey.trainingCompletedAt ? `Realizado ${dateOnly(journey.trainingCompletedAt)}` : journey.singleAlignmentCompletedAt ? "Substituído pelo alinhamento" : "Pendente"}</strong></span><span><small>Alinhamento único</small><strong>{journey.singleAlignmentCompletedAt ? `Realizado ${dateOnly(journey.singleAlignmentCompletedAt)}` : "Não utilizado"}</strong></span><span><small>Health Score</small><strong>{score}%</strong></span><span><small>Interações</small><strong>{history.length}</strong></span></div><label>Motivo da decisão<textarea value={decisionReason} disabled={!canEdit} onChange={(event) => setDecisionReason(event.target.value)} rows={4} placeholder="Descreva obrigatoriamente o motivo da decisão." /></label>{journey.cancellationPendingApproval ? <div className="cs-conference-actions compact"><button className="secondary-button danger-action" disabled={!canEdit || busy || !decisionReason.trim()} onClick={() => void resolveCommercialCancellation(false)}><RotateCcw size={16} /> Manter em acompanhamento</button><button className="danger-button" disabled={!canEdit || busy || !decisionReason.trim()} onClick={() => void resolveCommercialCancellation(true)}><Ban size={16} /> Aprovar cancelamento</button></div> : <div className="cs-conference-actions"><button className="secondary-button danger-action" disabled={!canEdit || busy || !decisionReason.trim()} onClick={() => void moveFromConference("tracking", "Em acompanhamento")}><XCircle size={16} /> Reprovado</button><button className="primary-button" disabled={!canEdit || busy || !decisionReason.trim()} onClick={() => void moveFromConference("finished", "Finalizado")}><BadgeCheck size={16} /> Aprovado com sucesso</button><button className="warning-button" disabled={!canEdit || busy || !decisionReason.trim()} onClick={() => void moveFromConference("unsuccessful", "Finalizado por falta de retorno")}><Clock3 size={16} /> Finalizar por falta de retorno</button><button className="danger-button" disabled={!canEdit || busy || !decisionReason.trim()} onClick={() => void moveFromConference("cancelled", "Cancelado")}><Ban size={16} /> Cancelado</button><button className="warning-button" disabled={!canEdit || busy || !decisionReason.trim()} onClick={() => void moveFromConference("cancelledWithoutTraining", "Cancelado sem treinamento")}><AlertTriangle size={16} /> Cancelado sem treinamento</button></div>}</section>}

      {isClosedCsJourney(journey.phase) && <section className="cs-drawer-panel cs-final-panel"><header><span className="eyebrow">{phaseName.toUpperCase()}</span><h3>{journey.phase === "finished" ? "Jornada concluída" : journey.phase === "unsuccessful" ? "Finalizado por falta de retorno" : "Cliente cancelado"}</h3><p>{(journey.phase === "finished" ? journey.approvalReason : journey.phase === "unsuccessful" ? journey.finalReason : journey.cancellationReason) || "Todas as informações permanecem disponíveis para consulta."}</p></header><div className="cs-decision-summary"><span><small>Status</small><strong>{journey.status || phaseName}</strong></span><span><small>Responsável</small><strong>{item.owner}</strong></span><span><small>Health Score</small><strong>{score}%</strong></span><span><small>Última atualização</small><strong>{dateTime(item.updated_at)}</strong></span></div>{canResumeCsJourney(journey.phase) && <div className="cs-retention-resume"><div><RotateCcw /><span><strong>Retomar acompanhamento</strong><small>Retorna à validação e inicia um novo ciclo. O histórico e os agendamentos anteriores ficam preservados.</small></span></div><button className="primary-button" disabled={!canEdit || busy} onClick={() => void resumeInValidation()}><RotateCcw size={15} /> Retomar cliente</button></div>}{journey.track === "retention" && journey.phase === "finished" && <div className="cs-retention-resume"><div><RotateCcw /><span><strong>Retomar tratativa</strong><small>Cria uma cópia na primeira coluna do CRM Retenção e preserva todo o histórico desta jornada.</small></span></div><button className="primary-button" disabled={!canEdit || busy || journey.status === "Cliente no CRM Retenção"} onClick={() => void resumeInRetention()}><RotateCcw size={15} /> {journey.status === "Cliente no CRM Retenção" ? "Cliente no CRM Retenção" : "Retomar card no CRM Retenção"}</button></div>}</section>}

      <section className="cs-drawer-panel"><header><span className="eyebrow">HISTÓRICO DE INTERAÇÕES</span><h3>Jornada completa do cliente</h3></header>{canEdit && !isClosedCsJourney(journey.phase) && <div className="cs-comment-form"><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Adicionar comentário de evolução..." /><button className="primary-button" disabled={busy || !comment.trim()} onClick={() => void save({ ...journey }, comment.trim(), item.owner, "Comentário").then((result) => { if (result) setComment(""); })}><MessageSquareText size={15} /> Registrar</button></div>}<div className="cs-history">{history.length === 0 ? <p>Nenhuma interação registrada.</p> : history.map((entry, index) => <article key={`${entry.createdAt}-${index}`}><i /><div><strong>{entry.kind || "Atualização"}</strong><small>{entry.actor || "Sistema"} · {dateTime(entry.createdAt)}</small><p>{entry.text}</p></div></article>)}</div></section>
      {journey.phase === "tracking" && <ScoreEvolutionPanel entries={journey.scoreEvolution ?? []} />}
    </div>
    {taskEditor && <CancellationEntryModal customers={customers} catalogs={catalogs} employees={employees} currentUser={currentUser} busy={busy} onClose={() => setTaskEditor(false)} prefill={{ clientId: journey.clientId || item.customer_id || "", customerName: item.customer_name || item.title, adhesionDate: item.created_at.slice(0, 10), plan: commercial?.products?.[0]?.plan || "", monthlyValueCents: item.amount_cents, seller: commercial?.seller || commercialSource?.owner || "", csOwner: item.owner, notes: `Cliente ${item.title} solicitou cancelamento durante ${phaseName}. Registre tratativas, motivo e tentativa de reversão.`, sourceModule: "cs", sourceItemId: item.id, linkedCsItemId: item.id }} onSave={async (detail) => { await requestCancellation(detail); }} />}
  </aside></div>;
}

function JourneyTimeline({ current }: { current: CsPhase }) {
  const unsuccessful = canResumeCsJourney(current);
  const terminal = PHASES.find(entry => entry.id === (unsuccessful ? current : "finished"))!;
  const standard = [...PHASES.slice(0, 4), terminal];
  const activeIndex = standard.findIndex(entry => entry.id === current);
  return <div className="cs-journey-timeline">{standard.map((phase, index) => <span key={phase.id} className={`${!unsuccessful && index < activeIndex ? "done" : ""} ${phase.id === current ? "active" : ""} ${unsuccessful && phase.id === current ? "negative" : ""}`}><i>{!unsuccessful && index < activeIndex ? <Check size={12} /> : index + 1}</i><b>{phase.label}</b></span>)}</div>;
}

function CancellationPanel({ journey, canEdit, canCreateTask, busy, onRequest }: { journey: CsJourney; canEdit: boolean; canCreateTask: boolean; busy: boolean; onRequest: () => void }) {
  if (!journey.cancellationRequestedAt) return <section className="cs-cancellation-panel neutral"><div><Ban size={17} /><span><strong>Solicitação de cancelamento</strong><small>Disponível em todas as etapas da jornada.</small></span></div>{canEdit && <button className="secondary-button" disabled={!canCreateTask || busy} title={!canCreateTask ? "É necessária permissão para criar cancelamentos" : "Abrir solicitação"} onClick={onRequest}>Cliente solicitou cancelamento</button>}</section>;
  if (journey.cancellationPendingApproval) return <section className="cs-cancellation-panel requested"><div><AlertTriangle size={18} /><span><strong>Cliente não convertido pelo Comercial</strong><small>Aguardando conferência da coordenação · {journey.cancellationReason || "Motivo não informado"}</small></span></div>{journey.cancellationTaskLink && <a href={journey.cancellationTaskLink}><ExternalLink size={14} /> Abrir em Cancelamentos</a>}</section>;
  if (journey.cancellationOutcome === "reverted") return <section className="cs-cancellation-panel reverted"><div><RotateCcw size={17} /><span><strong>Cancelamento revertido</strong><small>{journey.cancellationReason} · {dateTime(journey.cancellationResolvedAt)}</small></span></div>{journey.cancellationTaskLink && <a href={journey.cancellationTaskLink}><ExternalLink size={14} /> {journey.cancellationTaskProtocol || "Abrir tarefa"}</a>}</section>;
  if (journey.cancellationOutcome === "cancelled") return <section className="cs-cancellation-panel cancelled"><div><XCircle size={17} /><span><strong>Cliente cancelado</strong><small>{journey.cancellationReason} · {dateTime(journey.cancellationResolvedAt)}</small></span></div>{journey.cancellationTaskLink && <a href={journey.cancellationTaskLink}><ExternalLink size={14} /> {journey.cancellationTaskProtocol || "Abrir tarefa"}</a>}</section>;
  return <section className="cs-cancellation-panel requested"><div><AlertTriangle size={18} /><span><strong>Cliente solicitou cancelamento</strong><small>{journey.cancellationRequestedBy} · {dateTime(journey.cancellationRequestedAt)}</small></span></div>{journey.cancellationTaskLink && <a href={journey.cancellationTaskLink}><ExternalLink size={14} /> Abrir na fila de cancelamentos</a>}</section>;
}

function FeaturePicker({ label, options, selected, disabled, onChange }: { label: string; options: CatalogOption[]; selected: string[]; disabled: boolean; onChange: (values: string[]) => void }) {
  const toggle = (name: string) => onChange(selected.includes(name) ? selected.filter((entry) => entry !== name) : [...selected, name]);
  const names=[...new Set(options.map(option=>option.name))];
  return <fieldset className="cs-feature-picker"><legend>{label} ({selected.filter(name=>names.includes(name)).length})</legend><div>{names.length === 0 ? <small>Nenhuma opção cadastrada. Use a engrenagem da funcionalidade para configurar.</small> : names.map((name) => <button type="button" disabled={disabled} className={selected.includes(name) ? "selected" : ""} key={name} onClick={() => toggle(name)}><Check size={12} /> {name}</button>)}</div></fieldset>;
}

function ScoreEvolutionPanel({ entries }: { entries: ScoreEvolutionEntry[] }) {
  const months = [...new Set(entries.map((entry) => entry.period || entry.createdAt.slice(0, 7)))].sort().reverse();
  const [period, setPeriod] = useState(months[0] || new Date().toISOString().slice(0, 7));
  const visible = entries.filter((entry) => (entry.period || entry.createdAt.slice(0, 7)) === period).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <section className="cs-drawer-panel cs-score-evolution-panel">
    <header><span><span className="eyebrow">EVOLUÇÃO DO CLIENTE</span><h3>Score e features por período</h3><p>Histórico automático das alterações realizadas no acompanhamento.</p></span><label>Período<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label></header>
    {visible.length === 0 ? <p className="cs-score-evolution-empty">Nenhuma alteração de score ou feature registrada neste período.</p> : <div className="cs-score-evolution-list">{visible.map((entry) => <article key={entry.id}><strong>{entry.previousScore}% <ArrowRight size={13} /> {entry.score}%</strong><span><b>Base</b> {entry.featuresBase.join(", ") || "Nenhuma"}</span><span><b>Em uso</b> {entry.featuresActive.join(", ") || "Nenhuma"}</span><span><b>Plus</b> {entry.featuresPlus.join(", ") || "Nenhuma"}</span><footer>{entry.actor} · {dateTime(entry.createdAt)}</footer></article>)}</div>}
  </section>;
}

function CancellationTaskModal({ item, journey, commercial, customers, module, employees, busy, onClose, onSubmit }: { item: WorkItem; journey: CsJourney; commercial: CommercialLead | null; customers: Customer[]; module: TaskModuleData; employees: Employee[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<OperationResult> }) {
  const publicCustomerId = (customer?: Customer) => { const digits=customer?.document_masked?.replace(/\D/g,"")??""; return digits.length===6?digits:""; };
  const departments = module.departments.filter((entry) => entry.active);
  const initialCustomer = customers.find((entry) => entry.id === item.customer_id || entry.id === journey.clientId);
  const [departmentId, setDepartmentId] = useState(departments.find((entry) => /sucesso|cs|reten/i.test(entry.name))?.id || departments[0]?.id || "");
  const availableTypes = module.types.filter((entry) => entry.active && (!entry.departmentIds.length || entry.departmentIds.includes(departmentId)));
  const [typeId, setTypeId] = useState(availableTypes[0]?.id || module.types.find((entry) => entry.active)?.id || "");
  const [priorityId, setPriorityId] = useState(module.priorities.find((entry) => entry.active && /alta|p1/i.test(entry.name))?.id || module.priorities.find((entry) => entry.active)?.id || "");
  const collaborators = module.collaborators.filter((entry) => entry.active && (!departmentId || entry.departmentIds.includes(departmentId)));
  const [assigneeUserId, setAssigneeUserId] = useState(collaborators.find((entry) => entry.name === item.owner)?.id || "");
  const [customerId, setCustomerId] = useState(initialCustomer?.id || item.customer_id || "");
  const [customerCode, setCustomerCode] = useState(/^\d{6}$/.test(journey.clientId||"") ? journey.clientId! : publicCustomerId(initialCustomer));
  const [clientWhatsApp, setClientWhatsApp] = useState(commercial?.phone || initialCustomer?.phone || "");
  useEffect(() => { if (!availableTypes.some((entry) => entry.id === typeId)) setTypeId(availableTypes[0]?.id || ""); }, [departmentId, availableTypes, typeId]);
  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((entry) => entry.id === id);
    if (!customer) return;
    setCustomerCode(publicCustomerId(customer));
    setClientWhatsApp(customer.phone || clientWhatsApp);
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const taskType = module.types.find((entry) => entry.id === typeId);
    const selectedCustomer = customers.find((entry) => entry.id === customerId);
    void onSubmit({ title: String(form.get("title") || `Solicitação de cancelamento · ${item.title}`), description: String(form.get("description") || ""), typeId, priorityId, statusId: taskType?.initialStatusId, sourceDepartmentId: departmentId, currentDepartmentId: departmentId, assigneeUserId: assigneeUserId || null, customerId: selectedCustomer?.id || null, customerCode: customerCode.trim(), customerName: selectedCustomer?.trade_name || selectedCustomer?.legal_name || item.customer_name || item.title, clientWhatsApp: clientWhatsApp.trim(), externalLink: window.location.href, internalNotes: `Solicitação originada na etapa ${PHASES.find((entry) => entry.id === journey.phase)?.label}.`, dueAt: String(form.get("dueAt") || "") || null, cancellationRequest: true, participantUserIds: [], attachmentLinks: [] });
  };
  return <div className="modal-backdrop cs-task-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal cs-cancellation-task-modal"><header><div><span className="eyebrow">TAREFA VINCULADA</span><h2>Solicitação de cancelamento</h2><p>A tarefa ficará disponível no módulo Tarefas e ligada a este cliente.</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></header><form className="form-grid" onSubmit={submit}><label className="wide">Título<input name="title" required defaultValue={`Solicitação de cancelamento · ${item.title}`} /></label><label className="wide">Cliente cadastrado<select value={customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">Sem cliente vinculado</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.trade_name || customer.legal_name}</option>)}</select></label><label>ID do cliente<input required inputMode="numeric" maxLength={6} pattern="\d{6}" value={customerCode} onChange={(event) => setCustomerCode(event.target.value.replace(/\D/g,"").slice(0,6))} placeholder="000000" /></label><label>WhatsApp do cliente *<input type="tel" required minLength={10} value={clientWhatsApp} onChange={(event) => setClientWhatsApp(event.target.value)} placeholder="(11) 99999-9999" /></label><label>Setor<select value={departmentId} required onChange={(event) => { setDepartmentId(event.target.value); setAssigneeUserId(""); }}>{departments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Tipo<select value={typeId} required onChange={(event) => setTypeId(event.target.value)}>{availableTypes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Prioridade<select value={priorityId} required onChange={(event) => setPriorityId(event.target.value)}>{module.priorities.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Responsável<select value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)}><option value="">Fila do setor</option>{collaborators.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Prazo<input name="dueAt" type="datetime-local" /></label><label className="wide">Descrição<textarea name="description" required rows={5} defaultValue={`Cliente ${item.title} solicitou cancelamento durante ${PHASES.find((entry) => entry.id === journey.phase)?.label}. Registre tratativas, motivo e tentativa de reversão.`} /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || !departmentId || !typeId || !priorityId || !/^\d{6}$/.test(customerCode) || clientWhatsApp.replace(/\D/g, "").length < 10}><Send size={15} /> Criar tarefa e vincular</button></div></form></section></div>;
}
