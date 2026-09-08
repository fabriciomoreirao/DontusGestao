"use client";

import {
  Activity, AlertTriangle, ArrowRight, BadgeCheck, Ban, CalendarDays, Check, CheckCircle2,
  Clock3, Columns3, ExternalLink, Link2, List, MessageSquareText, Phone, Plus, RotateCcw, Save,
  Search, Send, Settings, ShieldCheck, Trash2, UserRound, X, XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AgendaModuleData } from "@/app/AgendaModule";
import type { TaskModuleData } from "@/app/TasksModule";

type OperationResult = { id?: string; createdProtocol?: string } | false;
type CsFlow = "onboarding" | "evolution";
type CsTrack = "activation" | "retention";
type CsPhase = "validation" | "onboarding" | "tracking" | "conference" | "finished" | "cancelled" | "cancelledWithoutTraining";

type WorkItem = {
  id: string; module: string; title: string; customer_id: string | null; customer_name: string;
  owner: string; status: string; amount_cents: number; description: string; version: number;
  updated_at: string; created_at: string;
};
type CatalogOption = { id: string; catalog: string; name: string; active: boolean };
type Customer = { id: string; trade_name: string; legal_name: string; phone: string; product_version: string; cs_owner: string };
type Employee = { id: string; displayName: string; email: string; departmentId: string | null; departmentName: string; departmentNames: string[]; photoDataUrl?: string; active: boolean };
type CurrentUser = { email: string; displayName: string; role: string; department: string; isCoordinator: boolean };
type HistoryEntry = { text: string; createdAt: string; actor?: string; kind?: string };
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
  rescheduledAt?: string;
  rescheduledTime?: string;
  meetingLink?: string;
  trackingStartedAt?: string;
  finalReason?: string;
  approvalReason?: string;
  rejectionReason?: string;
  status?: string;
  usage?: string;
  callStatus?: string;
  usageByDay?: Record<string, string>;
  conferenceRequestedAt?: string;
  conferenceConfirmedAt?: string;
  featuresBase: string[];
  featuresActive: string[];
  featuresPlus: string[];
  labels: string[];
  cancellationRequestedAt?: string;
  cancellationRequestedBy?: string;
  cancellationTaskId?: string;
  cancellationTaskProtocol?: string;
  cancellationTaskLink?: string;
  cancellationOutcome?: "requested" | "cancelled" | "reverted";
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
  { id: "cancelled", label: "Cancelados" },
  { id: "cancelledWithoutTraining", label: "Cancelado sem treinamento" },
];

const DEFAULT_STATUSES = ["Pendente", "Em andamento", "Aguardando cliente", "Em acompanhamento", "Em risco", "Conferência"];
const now = () => new Date().toISOString();
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const dateTime = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const dateOnly = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value)) : "—";
const trackedDays = (journey: CsJourney, item: WorkItem) => Math.max(0, Math.floor((Date.now() - new Date(journey.trackingStartedAt || journey.onboardingStartedAt || item.updated_at).getTime()) / 86_400_000));
const featureTokens = (values: string[]) => [...new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
const healthScore = (journey: CsJourney, featureUniverse: string[] = []) => {
  const contracted = featureTokens(featureUniverse.length ? featureUniverse : journey.featuresBase);
  if (!contracted.length) return 0;
  const inUse = normalize(featureTokens(journey.featuresActive).join(","));
  const matched = contracted.filter((feature) => inUse.includes(normalize(feature))).length;
  return Math.round(Math.max(0, Math.min(1, matched / contracted.length)) * 100);
};
const trackingMilestones = (track: CsTrack) => track === "retention" ? [1, 2, 3, 4, 7, 14, 21, 30] : [1, 2, 3, 4, 7, 14, 21, 30, 60, 90];
const usagePercent = (value?: string) => /nao|não|sem uso/i.test(value || "") ? 0 : /parcial/i.test(value || "") ? 50 : value ? 100 : 0;

function parseJourney(value: string): CsJourney | null {
  try {
    const raw = JSON.parse(value) as Partial<CsJourney> & { phase?: string; features?: string[] };
    if (raw.kind !== "csJourney") return null;
    const legacyPhase: Record<string, CsPhase> = { activation: "onboarding", evolution: "tracking", validationFinal: "cancelledWithoutTraining", closed: "finished" };
    const originalPhase = String(raw.phase ?? "validation");
    const parsedPhase = legacyPhase[originalPhase] ?? raw.phase ?? "validation";
    const phase = PHASES.some((entry) => entry.id === parsedPhase) ? parsedPhase as CsPhase : "validation";
    return {
      ...raw,
      kind: "csJourney",
      track: raw.track === "retention" ? "retention" : originalPhase === "evolution" ? "retention" : "activation",
      phase,
      featuresBase: Array.isArray(raw.featuresBase) ? raw.featuresBase : [],
      featuresActive: Array.isArray(raw.featuresActive) ? raw.featuresActive : Array.isArray(raw.features) ? raw.features : [],
      featuresPlus: Array.isArray(raw.featuresPlus) ? raw.featuresPlus : [],
      labels: Array.isArray(raw.labels) ? raw.labels : [],
      usageByDay: raw.usageByDay && typeof raw.usageByDay === "object" ? raw.usageByDay : {},
      follows: Array.isArray(raw.follows) ? raw.follows : [],
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
  if (phase === "cancelled" || phase === "cancelledWithoutTraining") return "negative";
  if (phase === "conference") return "warning";
  return "info";
}

export default function CustomerSuccessJourneyModule({
  flow, catalogs, items, customers, agendaModule, taskModule, employees, currentUser, busy, canCreate, canEdit, canDelete,
  canCreateTask, operate, onOpenSettings,
}: {
  flow: CsFlow; catalogs: CatalogOption[]; items: WorkItem[]; customers: Customer[]; agendaModule: AgendaModuleData | null;
  taskModule: TaskModuleData | null; employees: Employee[]; currentUser: CurrentUser; busy: boolean;
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
  const isCoordinator = currentUser.isCoordinator || /admin|gestor|coordenador/i.test(currentUser.role);
  const track: CsTrack = flow === "evolution" ? "retention" : "activation";
  const featureUniverse = useMemo(() => featureTokens(catalogs
    .filter((entry) => entry.active && ["csFeature", "csFeatureBase", "csFeatureActive", "csFeaturePlus"].includes(entry.catalog))
    .map((entry) => entry.name)), [catalogs]);

  useEffect(() => setTab(flow === "evolution" ? "tracking" : "validation"), [flow]);

  const records = useMemo(() => items
    .filter((item) => item.module === "cs")
    .map((item) => ({ item, journey: parseJourney(item.description) }))
    .filter((entry): entry is { item: WorkItem; journey: CsJourney } => Boolean(entry.journey && entry.journey.track === track)), [items, track]);
  const counts = useMemo(() => Object.fromEntries(PHASES.map((phase) => [phase.id, records.filter((entry) => entry.journey.phase === phase.id).length])) as Record<CsPhase, number>, [records]);
  const statuses = useMemo(() => {
    const configured = catalogs.filter((entry) => entry.active && ["csWorkflowStatus", "csFinalStatus"].includes(entry.catalog)).map((entry) => entry.name);
    return [...new Set([...configured, ...records.map((entry) => entry.journey.status).filter(Boolean) as string[], ...DEFAULT_STATUSES])];
  }, [catalogs, records]);
  const visible = useMemo(() => records.filter(({ item, journey }) => {
    const needle = normalize(query.trim());
    const commercial = items.find((entry) => entry.id === journey.sourceLeadId);
    const phone = commercial ? parseCommercial(commercial.description)?.phone : "";
    const permitted = isCoordinator || item.owner === currentUser.displayName || journey.phase === "validation";
    return journey.phase === tab && permitted
      && (!needle || normalize(`${item.id} ${journey.clientId} ${item.title} ${item.customer_name} ${item.owner} ${phone}`).includes(needle))
      && (ownerFilter === "all" || item.owner === ownerFilter)
      && (statusFilter === "all" || (journey.status || "Pendente") === statusFilter);
  }), [records, tab, query, ownerFilter, statusFilter, isCoordinator, currentUser.displayName, items]);

  const totalTrackingDays = records.filter((entry) => entry.journey.phase === "tracking").reduce((sum, entry) => sum + trackedDays(entry.journey, entry.item), 0);
  const averageHealth = records.filter((entry) => entry.journey.phase === "tracking").length
    ? Math.round(records.filter((entry) => entry.journey.phase === "tracking").reduce((sum, entry) => sum + healthScore(entry.journey, featureUniverse), 0) / records.filter((entry) => entry.journey.phase === "tracking").length)
    : 0;
  const title = flow === "evolution" ? "Acompanhamento — Retenção" : "Acompanhamento — Ativação";

  const saveSelected = async (payload: Record<string, unknown>, success = "Jornada atualizada com sucesso.") => {
    if (!selected) return false;
    const result = await operate({ action: "updateWorkItem", id: selected.id, title: selected.title, owner: selected.owner, customerName: selected.customer_name, amountCents: selected.amount_cents, version: selected.version, ...payload }, success);
    if (result) setSelected((current) => current ? { ...current, ...(payload.owner ? { owner: String(payload.owner) } : {}), ...(payload.description ? { description: String(payload.description) } : {}), version: current.version + 1, updated_at: now() } : current);
    return result;
  };

  return <section className="cs-pipeline-module">
    <header className="cs-pipeline-heading module-page-header">
      <div className="cs-title-icon module-page-title-icon"><Activity size={21} /></div>
      <div><span className="eyebrow">SUCESSO DO CLIENTE</span><h1>{title}</h1><p>Validação, implantação, evolução e retenção em uma jornada auditável.</p></div>
      <div className="cs-heading-actions module-page-actions">{onOpenSettings && <button className="icon-button commercial-settings-button" onClick={onOpenSettings} title="Configurar jornada e status" aria-label="Configurar jornada e status"><Settings size={18} /></button>}{canCreate && <button className="primary-button" type="button" onClick={() => setCreating(true)}><Plus size={16} /> Inserir cliente</button>}</div>
    </header>

    <section className="cs-pipeline-metrics">
      <article><span><Activity size={17} /></span><small>EM ACOMPANHAMENTO</small><strong>{counts.tracking}</strong><p>{totalTrackingDays} dias acumulados</p></article>
      <article><span><CheckCircle2 size={17} /></span><small>FINALIZADOS</small><strong>{counts.finished}</strong><p>Jornadas concluídas</p></article>
      <article><span><ShieldCheck size={17} /></span><small>HEALTH SCORE MÉDIO</small><strong>{averageHealth}%</strong><p>Funcionalidades cadastradas em uso</p></article>
      <article><span><AlertTriangle size={17} /></span><small>CANCELAMENTOS</small><strong>{counts.cancelled + counts.cancelledWithoutTraining}</strong><p>{records.filter((entry) => entry.journey.cancellationOutcome === "requested").length} solicitação(ões) aberta(s)</p></article>
    </section>

    <nav className="cs-pipeline-tabs" aria-label="Etapas do acompanhamento">
      {PHASES.map((phase) => <button key={phase.id} className={tab === phase.id ? "active" : ""} onClick={() => setTab(phase.id)}>{phase.label}<b>{counts[phase.id]}</b></button>)}
    </nav>

    <section className="cs-pipeline-toolbar">
      <label className="cs-pipeline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, ID, responsável ou telefone" /></label>
      <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} aria-label="Filtrar responsável"><option value="all">Todos os responsáveis</option>{[...new Set(records.map((entry) => entry.item.owner).filter(Boolean))].map((owner) => <option key={owner}>{owner}</option>)}</select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar status"><option value="all">Todos os status</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
      <span>{visible.length} resultado(s)</span>
      <div className="cs-view-switch"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Visualizar em cards"><Columns3 size={16} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="Visualizar em lista"><List size={16} /></button></div>
    </section>

    {visible.length === 0 ? <div className="cs-pipeline-empty"><ClipboardCheckIcon /><h2>Nenhum cliente nesta etapa</h2><p>Os clientes aparecem automaticamente conforme avançam na jornada.</p></div> : view === "grid" ? <div className="cs-pipeline-grid">{visible.map(({ item, journey }) => <JourneyCard key={item.id} item={item} journey={journey} featureUniverse={featureUniverse} commercial={items.find((entry) => entry.id === journey.sourceLeadId)} employee={employees.find(employee => employee.displayName === item.owner)} canDelete={canDelete} onOpen={() => setSelected(item)} onDelete={() => void operate({ action: "deleteWorkItem", id: item.id }, "Cliente excluído com sucesso.")} />)}</div> : <JourneyList records={visible} sourceItems={items} featureUniverse={featureUniverse} canDelete={canDelete} onOpen={setSelected} onDelete={(item) => void operate({ action: "deleteWorkItem", id: item.id }, "Cliente excluído com sucesso.")} />}

    {selected && <JourneyDrawer item={selected} journey={parseJourney(selected.description)!} commercialSource={items.find((entry) => entry.id === parseJourney(selected.description)?.sourceLeadId)} catalogs={catalogs.filter((entry) => entry.active)} agendaModule={agendaModule} taskModule={taskModule} employees={employees.filter((entry) => entry.active)} currentUser={currentUser} busy={busy} canEdit={canEdit} canCreateTask={canCreateTask} onClose={() => setSelected(null)} operate={operate} onSave={saveSelected} />}
    {creating && <ManualJourneyModal track={track} customers={customers} employees={employees.filter((entry) => entry.active)} statuses={statuses} currentUser={currentUser} busy={busy} onClose={() => setCreating(false)} onSave={async (payload) => { const result = await operate(payload, `Cliente inserido manualmente no acompanhamento de ${track === "activation" ? "ativação" : "retenção"}.`); if (result) setCreating(false); }} />}
  </section>;
}

function ManualJourneyModal({ track, customers, employees, statuses, currentUser, busy, onClose, onSave }: { track: CsTrack; customers: Customer[]; employees: Employee[]; statuses: string[]; currentUser: CurrentUser; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [owner, setOwner] = useState(currentUser.displayName);
  const [phase, setPhase] = useState<CsPhase>("validation");
  const [status, setStatus] = useState(statuses[0] || "Pendente");
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
    const journey: CsJourney = { kind: "csJourney", track, phase, clientId: customerId || undefined, commerciallyApproved: true, status, onboardingStartedAt: phase === "onboarding" ? now() : undefined, trackingStartedAt: phase === "tracking" ? now() : undefined, featuresBase: [], featuresActive: [], featuresPlus: [], labels: [], follows: [{ kind: "Inserção manual", text: `Cliente inserido manualmente em ${PHASES.find((entry) => entry.id === phase)?.label}. Telefone: ${phone || "não informado"}.`, createdAt: now(), actor: currentUser.displayName }] };
    void onSave({ action: "createWorkItem", module: "cs", recordType: track === "activation" ? "Acompanhamento de ativação" : "Acompanhamento de retenção", title: name.trim(), customerId: customers.some((entry) => entry.id === customerId) ? customerId : null, customerName: name.trim(), owner, team: track === "activation" ? "Sucesso do Cliente · Ativação" : "Sucesso do Cliente · Retenção", priority: "P3", amountCents: 0, description: JSON.stringify(journey) });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal cs-manual-modal" role="dialog" aria-modal="true"><header className="modal-head"><div><span className="eyebrow">INSERÇÃO MANUAL</span><h2>Novo cliente em {track === "activation" ? "Ativação" : "Retenção"}</h2><p>Cadastre um cliente existente ou informe os dados manualmente.</p></div><button className="icon-button" type="button" onClick={onClose}><X size={18} /></button></header><form className="form-grid" onSubmit={submit}><label className="wide">Cliente cadastrado<select value={customers.some((entry) => entry.id === customerId) ? customerId : ""} onChange={(event) => chooseCustomer(event.target.value)}><option value="">Inserir dados manualmente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.trade_name} · {customer.id.slice(0, 8)}</option>)}</select></label><label>ID do cliente<input value={customerId} onChange={(event) => setCustomerId(event.target.value)} placeholder="ID interno ou código do cliente" /></label><label>Cliente / empresa *<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>Responsável<select required value={owner} onChange={(event) => setOwner(event.target.value)}><option value={currentUser.displayName}>{currentUser.displayName}</option>{employees.filter((entry) => entry.displayName !== currentUser.displayName).map((employee) => <option key={employee.id}>{employee.displayName}</option>)}</select></label><label>Etapa inicial<select value={phase} onChange={(event) => setPhase(event.target.value as CsPhase)}><option value="validation">Validação</option><option value="onboarding">Onboarding</option><option value="tracking">Acompanhamento</option></select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || !name.trim()}><Plus size={15} /> Inserir cliente</button></div></form></section></div>;
}

function ClipboardCheckIcon() { return <span className="cs-empty-icon"><CheckCircle2 size={24} /></span>; }

function JourneyCard({ item, journey, featureUniverse, commercial, employee, canDelete, onOpen, onDelete }: { item: WorkItem; journey: CsJourney; featureUniverse: string[]; commercial?: WorkItem; employee?: Employee; canDelete: boolean; onOpen: () => void; onDelete: () => void }) {
  const lead = commercial ? parseCommercial(commercial.description) : null;
  const score = healthScore(journey, featureUniverse);
  return <article className="cs-client-card">
    <button className="cs-client-card-main" onClick={onOpen}>
      {journey.sourceLeadId && (journey.scheduledAt || journey.firstMeetingAt) && <div className="cs-commercial-kickoff-banner"><CheckCircle2 size={15} /><span><strong>Kick off já agendado pelo Comercial</strong><small>{dateOnly(journey.firstMeetingAt || journey.scheduledAt || "")} às {journey.firstMeetingTime || new Date(journey.firstMeetingAt || journey.scheduledAt || "").toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></span></div>}
      <header><span><strong>{item.title}</strong>{journey.checkedAt && <CheckCircle2 size={15} aria-label="Dados conferidos" />}</span><b className={`cs-stage-pill ${phaseTone(journey.phase)}`}>{PHASES.find((entry) => entry.id === journey.phase)?.label}</b></header>
      <small>ID {journey.clientId || item.id.slice(0, 8)}</small>
      <div className="cs-card-owner" data-collaborator-name={item.owner}><span className={`cs-owner-avatar ${employee?.photoDataUrl ? "has-photo" : ""}`} style={employee?.photoDataUrl ? { backgroundImage: `url("${employee.photoDataUrl}")` } : undefined}>{!employee?.photoDataUrl && <UserRound size={11} />}</span>{item.owner || "Não atribuído"}</div>
      {lead?.phone && <div className="cs-card-phone"><Phone size={13} /> {lead.phone}</div>}
      <div className="cs-card-progress"><span><small>Status</small><strong>{journey.status || "Pendente"}</strong></span>{journey.phase === "tracking" && <span><small>Dias</small><strong>{Math.min(trackedDays(journey, item), journey.track === "retention" ? 30 : 90)} / {journey.track === "retention" ? 30 : 90}</strong></span>}<span><small>Health</small><strong className={score >= 70 ? "good" : score >= 40 ? "warn" : "bad"}>{score}%</strong></span></div>
      {journey.phase === "tracking" && <div className="cs-card-usage-chart" aria-label="Evolução de utilização">{trackingMilestones(journey.track).map(day => <span key={day} title={`D+${day}: ${journey.usageByDay?.[String(day)] || "Não informado"}`}><i style={{ height: `${Math.max(5, usagePercent(journey.usageByDay?.[String(day)]))}%` }} /><small>{day}</small></span>)}</div>}
      {journey.cancellationOutcome === "requested" && <div className="cs-cancellation-chip"><AlertTriangle size={13} /> Cliente solicitou cancelamento</div>}
      {journey.cancellationOutcome === "reverted" && <div className="cs-reverted-chip"><RotateCcw size={13} /> Cancelamento revertido</div>}
    </button>
    <footer><button onClick={onOpen}><MessageSquareText size={14} /> Gerenciar cliente</button>{canDelete && <button className="delete" onClick={onDelete} aria-label="Excluir cliente"><Trash2 size={14} /></button>}</footer>
  </article>;
}

function JourneyList({ records, sourceItems, featureUniverse, canDelete, onOpen, onDelete }: { records: Array<{ item: WorkItem; journey: CsJourney }>; sourceItems: WorkItem[]; featureUniverse: string[]; canDelete: boolean; onOpen: (item: WorkItem) => void; onDelete: (item: WorkItem) => void }) {
  return <section className="cs-client-table"><header><span>ID</span><span>CLIENTE</span><span>RESPONSÁVEL</span><span>STATUS</span><span>DIAS</span><span>HEALTH</span><span>AÇÕES</span></header>{records.map(({ item, journey }) => {
    const lead = parseCommercial(sourceItems.find((entry) => entry.id === journey.sourceLeadId)?.description || "");
    const score = healthScore(journey, featureUniverse);
    return <article key={item.id}><span>{journey.clientId || item.id.slice(0, 8)}</span><span><strong>{item.title}</strong><small>{lead?.phone || item.customer_name}</small></span><span data-collaborator-name={item.owner}>{item.owner}</span><span><b className={`cs-stage-pill ${phaseTone(journey.phase)}`}>{journey.status || PHASES.find((entry) => entry.id === journey.phase)?.label}</b></span><span>{journey.phase === "tracking" ? `${Math.min(trackedDays(journey, item), journey.track === "retention" ? 30 : 90)} / ${journey.track === "retention" ? 30 : 90}` : "—"}</span><span className={score >= 70 ? "good" : score >= 40 ? "warn" : "bad"}>{score}%</span><span><button onClick={() => onOpen(item)} aria-label="Abrir cliente"><ExternalLink size={14} /></button>{canDelete && <button className="delete" onClick={() => onDelete(item)} aria-label="Excluir cliente"><Trash2 size={14} /></button>}</span></article>;
  })}</section>;
}

function JourneyDrawer({ item, journey, commercialSource, catalogs, agendaModule, taskModule, employees, currentUser, busy, canEdit, canCreateTask, onClose, operate, onSave }: {
  item: WorkItem; journey: CsJourney; commercialSource?: WorkItem; catalogs: CatalogOption[]; agendaModule: AgendaModuleData | null; taskModule: TaskModuleData | null;
  employees: Employee[]; currentUser: CurrentUser; busy: boolean; canEdit: boolean; canCreateTask: boolean; onClose: () => void;
  operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onSave: (payload: Record<string, unknown>, success?: string) => Promise<OperationResult>;
}) {
  const commercial = commercialSource ? parseCommercial(commercialSource.description) : null;
  const [responsible, setResponsible] = useState(item.owner === "Coordenação de CS" ? "" : item.owner);
  const [status, setStatus] = useState(journey.status || "Pendente");
  const [usage, setUsage] = useState(journey.usage || "");
  const [callStatus, setCallStatus] = useState(journey.callStatus || "");
  const [firstMeeting, setFirstMeeting] = useState((journey.firstMeetingAt || journey.scheduledAt || "").slice(0, 10));
  const [firstMeetingTime, setFirstMeetingTime] = useState(journey.firstMeetingTime || (journey.scheduledAt?.slice(11, 16) ?? "09:30"));
  const [training, setTraining] = useState((journey.trainingAt || "").slice(0, 10));
  const [trainingTime, setTrainingTime] = useState(journey.trainingTime || "09:30");
  const [meetingLink, setMeetingLink] = useState(journey.meetingLink || "");
  const [featuresBase, setFeaturesBase] = useState(journey.featuresBase);
  const [featuresActive, setFeaturesActive] = useState(journey.featuresActive);
  const [featuresPlus, setFeaturesPlus] = useState(journey.featuresPlus);
  const [labels, setLabels] = useState(journey.labels);
  const [usageByDay, setUsageByDay] = useState<Record<string, string>>(journey.usageByDay || {});
  const [comment, setComment] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [cancellationReason, setCancellationReason] = useState(journey.cancellationReason || "");
  const [taskEditor, setTaskEditor] = useState(false);

  const options = (catalog: string) => catalogs.filter((entry) => entry.catalog === catalog);
  const activeFeatureOptions = [...options("csFeatureBase"), ...options("csFeatureActive")].filter((entry, index, entries) => entries.findIndex((candidate) => normalize(candidate.name) === normalize(entry.name)) === index);
  const workflowStatuses = [...new Set([...options("csWorkflowStatus").map((entry) => entry.name), ...options("csFinalStatus").map((entry) => entry.name), ...DEFAULT_STATUSES])];
  const phaseName = PHASES.find((entry) => entry.id === journey.phase)?.label || "Jornada";
  const featureUniverse = featureTokens(catalogs.filter((entry) => ["csFeature", "csFeatureBase", "csFeatureActive", "csFeaturePlus"].includes(entry.catalog)).map((entry) => entry.name));
  const score = healthScore({ ...journey, featuresBase, featuresActive, featuresPlus }, featureUniverse);
  const milestones = trackingMilestones(journey.track);
  const append = (next: CsJourney, message: string, kind = "Atualização") => ({ ...next, follows: [...next.follows, { text: message, createdAt: now(), actor: currentUser.displayName, kind }] });
  const save = (next: CsJourney, message: string, owner = item.owner) => onSave({ owner, description: JSON.stringify(append(next, message)) }, message);

  const schedule = async (kind: "Kick off" | "Treinamento", date: string, time: string, key: "firstMeetingCommitmentId" | "trainingCommitmentId") => {
    if (!agendaModule || !date) return false;
    const calendar = agendaModule.calendars.find((entry) => /sucesso do cliente|ativa[cç][aã]o|cs/i.test(`${entry.name} ${entry.departmentName}`)) ?? agendaModule.calendars.find((entry) => entry.active);
    const type = agendaModule.types.find((entry) => entry.active);
    const agendaStatus = agendaModule.statuses.find((entry) => entry.active);
    const collaborator = agendaModule.collaborators.find((entry) => entry.name === item.owner) ?? agendaModule.collaborators.find((entry) => entry.departmentId === calendar?.departmentId);
    if (!calendar || !type || !agendaStatus || !collaborator) return false;
    const startsAt = new Date(`${date}T${time || "09:30"}:00`).toISOString();
    const result = await operate({ action: "createAgendaCommitment", agendaId: calendar.id, agendaTypeId: type.id, agendaStatusId: agendaStatus.id, responsibleUserId: collaborator.id, title: `${kind} · ${item.title}`, description: `Cliente ${journey.clientId || item.customer_name || item.title}${meetingLink ? `. Link: ${meetingLink}` : ""}`, startsAt, endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(), participantUserIds: [], recurrence: "none" }, `${kind} agendado e adicionado à agenda de ${collaborator.name}.`);
    if (!result) return false;
    await save({ ...journey, [key]: result.id, ...(kind === "Kick off" ? { firstMeetingAt: startsAt, firstMeetingTime: time, meetingLink } : { trainingAt: startsAt, trainingTime: time }) }, `${kind} agendado para ${dateOnly(startsAt)} às ${time}.`);
    return true;
  };

  const requestCancellation = async (payload: Record<string, unknown>) => {
    const result = await operate({ action: "createTask", ...payload }, "Tarefa de cancelamento criada com sucesso.");
    if (!result) return false;
    const link = `/?mod=tasks&task=${encodeURIComponent(result.id || result.createdProtocol || "")}`;
    const saved = await save({ ...journey, cancellationRequestedAt: now(), cancellationRequestedBy: currentUser.displayName, cancellationTaskId: result.id, cancellationTaskProtocol: result.createdProtocol, cancellationTaskLink: link, cancellationOutcome: "requested" }, `Cliente solicitou cancelamento. Tarefa ${result.createdProtocol || "criada"} vinculada.`, item.owner);
    if (saved) setTaskEditor(false);
    return saved;
  };

  const resolveCancellation = (outcome: "cancelled" | "reverted") => {
    if (!cancellationReason.trim()) return;
    const phase = outcome === "cancelled" ? (journey.phase === "onboarding" ? "cancelledWithoutTraining" : "cancelled") : journey.phase;
    void save({ ...journey, phase, cancellationOutcome: outcome, cancellationReason: cancellationReason.trim(), cancellationResolvedAt: now(), status: outcome === "reverted" ? "Cancelamento revertido" : "Cancelado" }, outcome === "reverted" ? `Solicitação de cancelamento revertida: ${cancellationReason.trim()}` : `Cliente cancelado: ${cancellationReason.trim()}`);
  };

  const sourceHistory: HistoryEntry[] = Array.isArray(commercial?.follows) ? commercial.follows.map((entry) => ({ text: entry.text || "Interação comercial", createdAt: entry.createdAt || commercialSource?.created_at || item.created_at, actor: entry.author || commercial?.seller, kind: "Comercial" })) : [];
  const history = [...sourceHistory, ...journey.follows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer cs-pipeline-drawer">
    <header className="cs-drawer-head"><div><span className="eyebrow">{phaseName.toUpperCase()}</span><h2>{item.title} {journey.checkedAt && <CheckCircle2 size={18} />}</h2><p>Cliente ID {journey.clientId || item.id.slice(0, 8)} · {item.customer_name || "Cadastro comercial"}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header>

    <div className="cs-drawer-content">
      <section className="cs-client-overview">
        <div><UserRound size={15} /><span><small>Responsável</small><strong>{item.owner || "Não atribuído"}</strong></span></div>
        <div><Phone size={15} /><span><small>Telefone</small><strong>{commercial?.phone || "Não informado"}</strong></span></div>
        <div><Clock3 size={15} /><span><small>Dias em acompanhamento</small><strong>{trackedDays(journey, item)} dias</strong></span></div>
        <div><Activity size={15} /><span><small>Health Score</small><strong className={score >= 70 ? "good" : score >= 40 ? "warn" : "bad"}>{score}%</strong></span></div>
        {commercialSource && <a href={`/?mod=commercial&commercialFlow=crm&lead=${encodeURIComponent(commercialSource.id)}`}><Link2 size={14} /> Abrir CRM</a>}
      </section>

      <CancellationPanel journey={journey} canEdit={canEdit} canCreateTask={canCreateTask} reason={cancellationReason} busy={busy} onReason={setCancellationReason} onRequest={() => setTaskEditor(true)} onResolve={resolveCancellation} />

      <JourneyTimeline current={journey.phase} />

      {commercial && <section className="cs-drawer-panel"><header><span className="eyebrow">ORIGEM COMERCIAL</span><h3>Informações e interações preservadas</h3></header><div className="cs-info-grid"><span><small>Origem</small><strong>{commercial.source || "Não informada"}</strong></span><span><small>Vendedor</small><strong>{commercial.seller || commercialSource?.owner || "Não informado"}</strong></span><span><small>Temperatura</small><strong>{commercial.temperature || "Não definida"}</strong></span><span><small>Produtos</small><strong>{commercial.products?.length || 0}</strong></span></div></section>}

      {journey.phase === "validation" && <section className="cs-drawer-panel"><header><span className="eyebrow">VALIDAÇÃO</span><h3>Conferir dados e encaminhar</h3><p>Confirme as informações comerciais antes de atribuir o onboarding.</p></header><label>Status<select value={status} disabled={!canEdit} onChange={(event) => setStatus(event.target.value)}>{workflowStatuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label><div className="cs-validation-actions"><button className={journey.checkedAt ? "secondary-button success-action" : "secondary-button"} disabled={!canEdit || busy || Boolean(journey.checkedAt)} onClick={() => void save({ ...journey, status, checkedAt: now(), checkedBy: currentUser.displayName }, "Dados comerciais conferidos.")}><Check size={16} /> {journey.checkedAt ? `Conferido em ${dateOnly(journey.checkedAt)}` : "Conferido"}</button><label>Encaminhar para<select value={responsible} disabled={!canEdit} onChange={(event) => setResponsible(event.target.value)}><option value="">Selecione o responsável</option>{employees.map((employee) => <option key={employee.id} value={employee.displayName}>{employee.displayName} · {employee.departmentName}</option>)}</select></label><button className="primary-button" disabled={!canEdit || busy || !journey.checkedAt || !responsible} onClick={() => void save({ ...journey, phase: "onboarding", status, onboardingStartedAt: now() }, "Cliente encaminhado para onboarding.", responsible)}><ArrowRight size={16} /> Encaminhar</button></div></section>}

      {journey.phase === "onboarding" && <section className="cs-drawer-panel"><header><span className="eyebrow">ONBOARDING</span><h3>Kick off e treinamento</h3><p>Agende na agenda do responsável, registre a realização e só então avance.</p></header><div className="cs-schedule-grid"><label>Kick off<input type="date" value={firstMeeting} disabled={!canEdit} onChange={(event) => setFirstMeeting(event.target.value)} /></label><label>Horário<input type="time" value={firstMeetingTime} disabled={!canEdit} onChange={(event) => setFirstMeetingTime(event.target.value)} /></label><label className="wide">Link da reunião<input type="url" value={meetingLink} disabled={!canEdit} onChange={(event) => setMeetingLink(event.target.value)} placeholder="https://meet.google.com/..." /></label><button className="secondary-button" disabled={!canEdit || busy || !firstMeeting || Boolean(journey.firstMeetingCommitmentId)} onClick={() => void schedule("Kick off", firstMeeting, firstMeetingTime, "firstMeetingCommitmentId")}><CalendarDays size={15} /> {journey.firstMeetingCommitmentId ? "Kick off na agenda" : "Agendar Kick off"}</button><button className={journey.firstMeetingCompletedAt ? "secondary-button success-action" : "secondary-button"} disabled={!canEdit || busy || !firstMeeting || Boolean(journey.firstMeetingCompletedAt)} onClick={() => void save({ ...journey, firstMeetingAt: `${firstMeeting}T${firstMeetingTime || "09:30"}:00`, firstMeetingTime, meetingLink, firstMeetingCompletedAt: now() }, "Kick off realizado.")}><Check size={15} /> {journey.firstMeetingCompletedAt ? "Kick off realizado" : "Marcar Kick off realizado"}</button></div><div className="cs-schedule-grid"><label>Treinamento<input type="date" value={training} disabled={!canEdit} onChange={(event) => setTraining(event.target.value)} /></label><label>Horário<input type="time" value={trainingTime} disabled={!canEdit} onChange={(event) => setTrainingTime(event.target.value)} /></label><span className="wide" /><button className="secondary-button" disabled={!canEdit || busy || !training || Boolean(journey.trainingCommitmentId)} onClick={() => void schedule("Treinamento", training, trainingTime, "trainingCommitmentId")}><CalendarDays size={15} /> {journey.trainingCommitmentId ? "Treinamento na agenda" : "Agendar treinamento"}</button><button className={journey.trainingCompletedAt ? "secondary-button success-action" : "secondary-button"} disabled={!canEdit || busy || !training || Boolean(journey.trainingCompletedAt)} onClick={() => void save({ ...journey, trainingAt: `${training}T${trainingTime || "09:30"}:00`, trainingTime, trainingCompletedAt: now() }, "Treinamento realizado.")}><Check size={15} /> {journey.trainingCompletedAt ? "Treinamento realizado" : "Marcar treinamento realizado"}</button></div><div className="cs-stage-forward"><span>{!journey.firstMeetingCompletedAt || !journey.trainingCompletedAt ? "Conclua o Kick off e o treinamento para liberar o encaminhamento." : "Pré-requisitos concluídos. Cliente pronto para acompanhamento."}</span><button className="primary-button" disabled={!canEdit || busy || !journey.firstMeetingCompletedAt || !journey.trainingCompletedAt} onClick={() => void save({ ...journey, phase: "tracking", status: "Em acompanhamento", trackingStartedAt: now() }, "Cliente encaminhado para acompanhamento.")}><ArrowRight size={16} /> Encaminhar para acompanhamento</button></div></section>}

      {journey.phase === "tracking" && <section className="cs-drawer-panel"><header><span className="eyebrow">ACOMPANHAMENTO</span><h3>Utilização, features e evolução</h3><p>{trackedDays(journey, item)} dias em acompanhamento · Health Score {score}%.</p></header><div className="cs-info-grid cs-edit-grid"><label>Status<select value={status} disabled={!canEdit} onChange={(event) => setStatus(event.target.value)}>{workflowStatuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Status de uso<select value={usage} disabled={!canEdit} onChange={(event) => setUsage(event.target.value)}><option value="">Selecione</option>{options("csUsage").map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><label>Status de ligação<select value={callStatus} disabled={!canEdit} onChange={(event) => setCallStatus(event.target.value)}><option value="">Selecione</option>{options("csCallStatus").map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label></div><section className="cs-feature-board"><header><div><span className="eyebrow">FEATURES</span><h3>Aderência do cliente</h3><p>Selecione várias opções. O score compara a base contratada com as funcionalidades efetivamente em uso.</p></div><strong className={score >= 70 ? "good" : score >= 40 ? "warn" : "bad"}>Health Score: {score}%</strong></header><FeaturePicker label="BASE CONTRATADA" options={options("csFeatureBase")} selected={featuresBase} onChange={setFeaturesBase} disabled={!canEdit} /><FeaturePicker label="EM USO" options={activeFeatureOptions} selected={featuresActive} onChange={setFeaturesActive} disabled={!canEdit} /><FeaturePicker label="PLUS" options={options("csFeaturePlus")} selected={featuresPlus} onChange={setFeaturesPlus} disabled={!canEdit} /></section><FeaturePicker label="ETIQUETAS" options={options("csLabel")} selected={labels} onChange={setLabels} disabled={!canEdit} /><div className="cs-growth"><header><span>Evolução da utilização · {journey.track === "retention" ? "30 dias" : "90 dias"}</span><strong>{score}% health</strong></header><div className="cs-usage-graph">{milestones.map(day => <span key={day} title={`D+${day}: ${usageByDay[String(day)] || "Não informado"}`}><i style={{ height: `${Math.max(5, usagePercent(usageByDay[String(day)]))}%` }} /><small>D+{day}</small></span>)}</div></div><section className="cs-usage-routine"><header><div><span className="eyebrow">ROTINA DE ACOMPANHAMENTO</span><h3>Status de utilização por dia</h3></div><small>Cada seleção fica registrada na evolução do cliente.</small></header><div>{milestones.map(day=><label key={day}><span>D+{day}</span><select value={usageByDay[String(day)]||""} disabled={!canEdit} onChange={event=>setUsageByDay(current=>({...current,[String(day)]:event.target.value}))}><option value="">Selecione</option>{(options("csUsage").length?options("csUsage").map(entry=>entry.name):["Utilizando","Parcialmente","Não utilizando"]).map(entry=><option key={entry}>{entry}</option>)}</select></label>)}</div></section><div className="cs-stage-forward"><button className="secondary-button" disabled={!canEdit || busy} onClick={() => void save({ ...journey, status, usage, callStatus, featuresBase, featuresActive, featuresPlus, labels, usageByDay }, "Acompanhamento atualizado.")}><Save size={16} /> Salvar evolução</button><button className="primary-button" disabled={!canEdit || busy} onClick={() => void save({ ...journey, phase: "conference", status: "Conferência", conferenceRequestedAt: now(), featuresBase, featuresActive, featuresPlus, labels, usage, callStatus, usageByDay }, "Cliente enviado para conferência.")}><Send size={16} /> Enviar para conferência</button></div></section>}

      {journey.phase === "conference" && <section className="cs-drawer-panel"><header><span className="eyebrow">CONFERÊNCIA</span><h3>Análise completa da jornada</h3><p>Confira o histórico, Health Score e evidências antes da decisão.</p></header><div className="cs-decision-summary"><span><small>Kick off</small><strong>{journey.firstMeetingCompletedAt ? `Realizado ${dateOnly(journey.firstMeetingCompletedAt)}` : "Pendente"}</strong></span><span><small>Treinamento</small><strong>{journey.trainingCompletedAt ? `Realizado ${dateOnly(journey.trainingCompletedAt)}` : "Pendente"}</strong></span><span><small>Health Score</small><strong>{score}%</strong></span><span><small>Interações</small><strong>{history.length}</strong></span></div><label>Motivo da decisão<textarea value={decisionReason} disabled={!canEdit} onChange={(event) => setDecisionReason(event.target.value)} rows={4} placeholder="Descreva obrigatoriamente o motivo da aprovação ou reprovação." /></label><div className="cs-stage-forward"><button className="secondary-button danger-action" disabled={!canEdit || busy || !decisionReason.trim()} onClick={() => void save({ ...journey, phase: "tracking", status: "Reprovado na conferência", rejectionReason: decisionReason.trim(), conferenceConfirmedAt: now() }, `Conferência reprovada: ${decisionReason.trim()}`)}><XCircle size={16} /> Reprovar</button><button className="primary-button" disabled={!canEdit || busy || !decisionReason.trim()} onClick={() => void save({ ...journey, phase: "finished", status: "Finalizado", approvalReason: decisionReason.trim(), conferenceConfirmedAt: now() }, `Conferência aprovada: ${decisionReason.trim()}`)}><BadgeCheck size={16} /> Aprovar e finalizar</button></div></section>}

      {["finished", "cancelled", "cancelledWithoutTraining"].includes(journey.phase) && <section className="cs-drawer-panel cs-final-panel"><header><span className="eyebrow">{phaseName.toUpperCase()}</span><h3>{journey.phase === "finished" ? "Jornada concluída" : "Cliente cancelado"}</h3><p>{journey.approvalReason || journey.cancellationReason || journey.finalReason || "Todas as informações permanecem disponíveis para consulta."}</p></header><div className="cs-decision-summary"><span><small>Status</small><strong>{journey.status || phaseName}</strong></span><span><small>Responsável</small><strong>{item.owner}</strong></span><span><small>Health Score</small><strong>{score}%</strong></span><span><small>Última atualização</small><strong>{dateTime(item.updated_at)}</strong></span></div></section>}

      <section className="cs-drawer-panel"><header><span className="eyebrow">HISTÓRICO DE INTERAÇÕES</span><h3>Jornada completa do cliente</h3></header>{canEdit && !["finished", "cancelled", "cancelledWithoutTraining"].includes(journey.phase) && <div className="cs-comment-form"><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Adicionar comentário de evolução..." /><button className="primary-button" disabled={busy || !comment.trim()} onClick={() => void save({ ...journey }, comment.trim()).then((result) => { if (result) setComment(""); })}><MessageSquareText size={15} /> Registrar</button></div>}<div className="cs-history">{history.length === 0 ? <p>Nenhuma interação registrada.</p> : history.map((entry, index) => <article key={`${entry.createdAt}-${index}`}><i /><div><strong>{entry.kind || "Atualização"}</strong><small>{entry.actor || "Sistema"} · {dateTime(entry.createdAt)}</small><p>{entry.text}</p></div></article>)}</div></section>
    </div>
    {taskEditor && taskModule && <CancellationTaskModal item={item} journey={journey} commercial={commercial} module={taskModule} employees={employees} busy={busy} onClose={() => setTaskEditor(false)} onSubmit={requestCancellation} />}
  </aside></div>;
}

function JourneyTimeline({ current }: { current: CsPhase }) {
  const activeIndex = PHASES.findIndex((entry) => entry.id === current);
  const standard = PHASES.slice(0, 5);
  return <div className="cs-journey-timeline">{standard.map((phase, index) => <span key={phase.id} className={`${index < activeIndex ? "done" : ""} ${phase.id === current ? "active" : ""}`}><i>{index < activeIndex ? <Check size={12} /> : index + 1}</i><b>{phase.label}</b></span>)}</div>;
}

function CancellationPanel({ journey, canEdit, canCreateTask, reason, busy, onReason, onRequest, onResolve }: { journey: CsJourney; canEdit: boolean; canCreateTask: boolean; reason: string; busy: boolean; onReason: (value: string) => void; onRequest: () => void; onResolve: (outcome: "cancelled" | "reverted") => void }) {
  if (!journey.cancellationRequestedAt) return <section className="cs-cancellation-panel neutral"><div><Ban size={17} /><span><strong>Solicitação de cancelamento</strong><small>Disponível em todas as etapas da jornada.</small></span></div>{canEdit && <button className="secondary-button" disabled={!canCreateTask || busy} title={!canCreateTask ? "É necessária permissão para criar tarefas" : "Abrir solicitação"} onClick={onRequest}>Cliente solicitou cancelamento</button>}</section>;
  if (journey.cancellationOutcome === "reverted") return <section className="cs-cancellation-panel reverted"><div><RotateCcw size={17} /><span><strong>Cancelamento revertido</strong><small>{journey.cancellationReason} · {dateTime(journey.cancellationResolvedAt)}</small></span></div>{journey.cancellationTaskLink && <a href={journey.cancellationTaskLink}><ExternalLink size={14} /> {journey.cancellationTaskProtocol || "Abrir tarefa"}</a>}</section>;
  if (journey.cancellationOutcome === "cancelled") return <section className="cs-cancellation-panel cancelled"><div><XCircle size={17} /><span><strong>Cliente cancelado</strong><small>{journey.cancellationReason} · {dateTime(journey.cancellationResolvedAt)}</small></span></div>{journey.cancellationTaskLink && <a href={journey.cancellationTaskLink}><ExternalLink size={14} /> {journey.cancellationTaskProtocol || "Abrir tarefa"}</a>}</section>;
  return <section className="cs-cancellation-panel requested"><div><AlertTriangle size={18} /><span><strong>Cliente solicitou cancelamento</strong><small>{journey.cancellationRequestedBy} · {dateTime(journey.cancellationRequestedAt)}</small></span></div>{journey.cancellationTaskLink && <a href={journey.cancellationTaskLink}><ExternalLink size={14} /> {journey.cancellationTaskProtocol || "Abrir tarefa"}</a>}{canEdit && <div className="cs-cancellation-resolution"><textarea value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Informe o motivo ou a ação de reversão." rows={2} /><button className="secondary-button danger-action" disabled={busy || !reason.trim()} onClick={() => onResolve("cancelled")}><XCircle size={15} /> Cancelado</button><button className="secondary-button success-action" disabled={busy || !reason.trim()} onClick={() => onResolve("reverted")}><RotateCcw size={15} /> Revertido</button></div>}</section>;
}

function FeaturePicker({ label, options, selected, disabled, onChange }: { label: string; options: CatalogOption[]; selected: string[]; disabled: boolean; onChange: (values: string[]) => void }) {
  const toggle = (name: string) => onChange(selected.includes(name) ? selected.filter((entry) => entry !== name) : [...selected, name]);
  const names=[...new Set(options.map(option=>option.name))];
  return <fieldset className="cs-feature-picker"><legend>{label} ({selected.filter(name=>names.includes(name)).length})</legend><div>{names.length === 0 ? <small>Nenhuma opção cadastrada. Use a engrenagem da funcionalidade para configurar.</small> : names.map((name) => <button type="button" disabled={disabled} className={selected.includes(name) ? "selected" : ""} key={name} onClick={() => toggle(name)}><Check size={12} /> {name}</button>)}</div></fieldset>;
}

function CancellationTaskModal({ item, journey, commercial, module, employees, busy, onClose, onSubmit }: { item: WorkItem; journey: CsJourney; commercial: CommercialLead | null; module: TaskModuleData; employees: Employee[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<OperationResult> }) {
  const departments = module.departments.filter((entry) => entry.active);
  const [departmentId, setDepartmentId] = useState(departments.find((entry) => /sucesso|cs|reten/i.test(entry.name))?.id || departments[0]?.id || "");
  const availableTypes = module.types.filter((entry) => entry.active && (!entry.departmentIds.length || entry.departmentIds.includes(departmentId)));
  const [typeId, setTypeId] = useState(availableTypes[0]?.id || module.types.find((entry) => entry.active)?.id || "");
  const [priorityId, setPriorityId] = useState(module.priorities.find((entry) => entry.active && /alta|p1/i.test(entry.name))?.id || module.priorities.find((entry) => entry.active)?.id || "");
  const collaborators = module.collaborators.filter((entry) => entry.active && (!departmentId || entry.departmentIds.includes(departmentId)));
  const [assigneeUserId, setAssigneeUserId] = useState(collaborators.find((entry) => entry.name === item.owner)?.id || "");
  useEffect(() => { if (!availableTypes.some((entry) => entry.id === typeId)) setTypeId(availableTypes[0]?.id || ""); }, [departmentId, availableTypes, typeId]);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const taskType = module.types.find((entry) => entry.id === typeId);
    void onSubmit({ title: String(form.get("title") || `Solicitação de cancelamento · ${item.title}`), description: String(form.get("description") || ""), typeId, priorityId, statusId: taskType?.initialStatusId, sourceDepartmentId: departmentId, currentDepartmentId: departmentId, assigneeUserId: assigneeUserId || null, customerId: item.customer_id, customerCode: journey.clientId || item.id.slice(0, 8), customerName: item.customer_name || item.title, clientWhatsApp: commercial?.phone || "", externalLink: window.location.href, internalNotes: `Solicitação originada na etapa ${PHASES.find((entry) => entry.id === journey.phase)?.label}.`, dueAt: String(form.get("dueAt") || "") || null, cancellationRequest: true, participantUserIds: [], attachmentLinks: [] });
  };
  return <div className="modal-backdrop cs-task-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal cs-cancellation-task-modal"><header><div><span className="eyebrow">TAREFA VINCULADA</span><h2>Solicitação de cancelamento</h2><p>A tarefa ficará disponível no módulo Tarefas e ligada a este cliente.</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></header><form className="form-grid" onSubmit={submit}><label className="wide">Título<input name="title" required defaultValue={`Solicitação de cancelamento · ${item.title}`} /></label><label>Setor<select value={departmentId} required onChange={(event) => { setDepartmentId(event.target.value); setAssigneeUserId(""); }}>{departments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Tipo<select value={typeId} required onChange={(event) => setTypeId(event.target.value)}>{availableTypes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Prioridade<select value={priorityId} required onChange={(event) => setPriorityId(event.target.value)}>{module.priorities.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Responsável<select value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)}><option value="">Fila do setor</option>{collaborators.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Prazo<input name="dueAt" type="datetime-local" /></label><label className="wide">Descrição<textarea name="description" required rows={5} defaultValue={`Cliente ${item.title} solicitou cancelamento durante ${PHASES.find((entry) => entry.id === journey.phase)?.label}. Registre tratativas, motivo e tentativa de reversão.`} /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || !departmentId || !typeId || !priorityId}><Send size={15} /> Criar tarefa e vincular</button></div></form></section></div>;
}
