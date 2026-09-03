"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Edit3, Filter, Plus, Save, Settings, Tag, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState, type CSSProperties } from "react";

export type AgendaCalendar = { id: string; name: string; description: string; departmentId: string; departmentName: string; active: boolean };
export type AgendaDepartment = { id: string; name: string; active: boolean };
export type AgendaType = { id: string; name: string; description: string; color: string; active: boolean };
export type AgendaStatus = { id: string; name: string; description: string; color: string; active: boolean };
export type AgendaCollaborator = { id: string; name: string; email: string; departmentId: string; departmentName: string; birthDate: string | null; startedAt: string | null };
export type AgendaCelebrant = { id: string; name: string; birthDate: string | null; startedAt: string | null };
export type AgendaCommitment = {
  id: string; agendaId: string; agendaTypeId: string; agendaStatusId: string; title: string; description: string;
  startsAt: string; endsAt: string; responsibleUserId: string; responsibleName: string; typeName: string;
  statusName: string; statusColor: string; createdBy: string; participantUserIds: string[];
};
export type AgendaModuleData = { calendars: AgendaCalendar[]; departments: AgendaDepartment[]; types: AgendaType[]; statuses: AgendaStatus[]; collaborators: AgendaCollaborator[]; celebrants: AgendaCelebrant[]; commitments: AgendaCommitment[]; canManage: boolean };
type Operate = (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>;

const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateKey = (iso: string) => dayKey(new Date(iso));
const time = (iso: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dateInput = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const timeInput = (iso: string) => new Date(iso).toTimeString().slice(0, 5);

type AgendaSpecialEvent = {
  id: string;
  date: string;
  title: string;
  detail: string;
  color: string;
  kind: "holiday" | "birthday" | "companyAnniversary";
};

const NATIONAL_HOLIDAYS = [
  [0, 1, "Confraternização Universal"],
  [3, 21, "Tiradentes"],
  [4, 1, "Dia Mundial do Trabalho"],
  [8, 7, "Independência do Brasil"],
  [9, 12, "Nossa Senhora Aparecida"],
  [10, 2, "Finados"],
  [10, 15, "Proclamação da República"],
  [10, 20, "Dia Nacional de Zumbi e da Consciência Negra"],
  [11, 25, "Natal"],
] as const;

function recurringDate(year: number, source: string) {
  const [, monthText, dayText] = source.slice(0, 10).split("-");
  const month = Number(monthText) - 1;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Number(dayText), lastDay));
}

function specialEventsForCalendar(month: Date, collaborators: AgendaCelebrant[]): AgendaSpecialEvent[] {
  const years = [month.getFullYear() - 1, month.getFullYear(), month.getFullYear() + 1];
  const uniqueCollaborators = [...new Map(collaborators.map((item) => [item.id, item])).values()];
  return years.flatMap((year) => {
    const holidays = NATIONAL_HOLIDAYS.map(([holidayMonth, date, name]) => ({
      id: `holiday-${year}-${holidayMonth}-${date}`,
      date: dayKey(new Date(year, holidayMonth, date)),
      title: `🇧🇷 ${name}`,
      detail: "Feriado nacional",
      color: "#dc2626",
      kind: "holiday" as const,
    }));
    const people = uniqueCollaborators.flatMap((collaborator) => {
      const events: AgendaSpecialEvent[] = [];
      if (collaborator.birthDate) {
        events.push({
          id: `birthday-${collaborator.id}-${year}`,
          date: dayKey(recurringDate(year, collaborator.birthDate)),
          title: `🎂 Aniversário · ${collaborator.name}`,
          detail: "Aniversário do colaborador",
          color: "#7c3aed",
          kind: "birthday",
        });
      }
      if (collaborator.startedAt) {
        const startedYear = Number(collaborator.startedAt.slice(0, 4));
        const completedYears = year - startedYear;
        if (completedYears > 0) {
          events.push({
            id: `company-${collaborator.id}-${year}`,
            date: dayKey(recurringDate(year, collaborator.startedAt)),
            title: `🏆 Empresa · ${collaborator.name}`,
            detail: `${completedYears} ${completedYears === 1 ? "ano" : "anos"} de Dontus`,
            color: "#d97706",
            kind: "companyAnniversary",
          });
        }
      }
      return events;
    });
    return [...holidays, ...people];
  });
}

export default function AgendaModule({ module, busy, operate, currentEmail, onOpenSettings }: { module: AgendaModuleData; busy: boolean; operate: Operate; currentEmail: string; onOpenSettings: () => void }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [typeFilter, setTypeFilter] = useState("all");
  const [collaboratorFilter, setCollaboratorFilter] = useState("all");
  const [calendarFilter, setCalendarFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AgendaCommitment | null>(null);
  const effectiveCalendarFilter = calendarFilter === "all" || module.calendars.some((item) => item.id === calendarFilter && item.active) ? calendarFilter : "all";
  const effectiveTypeFilter = typeFilter === "all" || module.types.some((item) => item.id === typeFilter && item.active) ? typeFilter : "all";
  const filtered = useMemo(() => module.commitments.filter((entry) =>
    (effectiveCalendarFilter === "all" || entry.agendaId === effectiveCalendarFilter) &&
    (effectiveTypeFilter === "all" || entry.agendaTypeId === effectiveTypeFilter) &&
    (collaboratorFilter === "all" || entry.responsibleUserId === collaboratorFilter || entry.participantUserIds.includes(collaboratorFilter)),
  ), [module.commitments, effectiveCalendarFilter, effectiveTypeFilter, collaboratorFilter]);
  const setupRequired = !module.calendars.some((item) => item.active) || !module.types.some((item) => item.active) || !module.statuses.some((item) => item.active);

  return <>
    <div className="page-header agenda-header"><div><span className="eyebrow">MÓDULO · AGENDA</span><h1>Agenda</h1><p>Visualize os compromissos do seu setor e use os filtros para encontrar rapidamente o que precisa.</p></div><div className="commercial-header-actions"><button className="icon-button commercial-settings-button" onClick={onOpenSettings} aria-label="Configurar Agenda" title="Configurar Agenda"><Settings size={18} /></button><button className="primary-button" disabled={setupRequired} onClick={() => setCreating(true)}><Plus size={17} /> Novo compromisso</button></div></div>
    {setupRequired && <div className="agenda-setup-note"><CalendarDays size={19} /><span><strong>Os cadastros da Agenda precisam ser concluídos.</strong><small>Crie ao menos uma agenda, um tipo e um status em Cadastros › Agenda.</small></span></div>}
    <section className="agenda-filters"><Filter size={16} /><select value={effectiveCalendarFilter} onChange={(event) => setCalendarFilter(event.target.value)}><option value="all">Todas as agendas</option>{module.calendars.filter((calendar) => calendar.active).map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name} · {calendar.departmentName}</option>)}</select><select value={effectiveTypeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Todos os tipos</option>{module.types.filter((type) => type.active).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select><select value={collaboratorFilter} onChange={(event) => setCollaboratorFilter(event.target.value)}><option value="all">Todos os colaboradores</option>{module.collaborators.map((collaborator) => <option key={`${collaborator.id}-${collaborator.departmentId}`} value={collaborator.id}>{collaborator.name}</option>)}</select></section>
    <MonthCalendar month={month} commitments={filtered} specialEvents={specialEventsForCalendar(month, module.celebrants ?? module.collaborators)} onPrevious={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} onNext={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} onOpen={setSelected} />
    {creating && <CommitmentModal module={module} busy={busy} currentEmail={currentEmail} onClose={() => setCreating(false)} onSave={async (payload) => { const result = await operate({ action: "createAgendaCommitment", ...payload }, "Compromisso agendado com sucesso."); if (result) setCreating(false); }} />}
    {selected && <AgendaCommitmentModal module={module} commitment={selected} busy={busy} currentEmail={currentEmail} onClose={() => setSelected(null)} onSave={async (payload) => { const result = await operate({ action: "updateAgendaCommitment", id: selected.id, ...payload }, "Compromisso atualizado com sucesso."); if (result) setSelected(null); }} onDelete={async () => { const result = await operate({ action: "deleteAgendaCommitment", id: selected.id }, "Compromisso excluído com sucesso."); if (result) setSelected(null); }} onChangeStatus={async (agendaStatusId) => { const result = await operate({ action: "changeAgendaCommitmentStatus", id: selected.id, agendaStatusId }, "Status do compromisso atualizado com sucesso."); if (!result) return false; const status = module.statuses.find((item) => item.id === agendaStatusId); if (status) setSelected((current) => current ? { ...current, agendaStatusId: status.id, statusName: status.name, statusColor: status.color } : current); return true; }} />}
  </>;
}

export function AgendaCatalogsModule({ module, busy, operate }: { module: AgendaModuleData; busy: boolean; operate: Operate }) {
  const [tab, setTab] = useState<"calendars" | "types" | "statuses">("calendars");
  const [calendar, setCalendar] = useState<AgendaCalendar | null | undefined>(undefined);
  const [type, setType] = useState<AgendaType | null | undefined>(undefined);
  const [status, setStatus] = useState<AgendaStatus | null | undefined>(undefined);
  const remove = async (action: string, id: string, label: string) => { await operate({ action, id }, `${label} excluído com sucesso.`); };
  return <>
    <div className="page-header agenda-header"><div><span className="eyebrow">CADASTROS · AGENDA</span><h1>Cadastros da Agenda</h1><p>Gerencie agendas por setor, tipos de agendamento e os status que determinam a cor dos compromissos.</p></div></div>
    <div className="agenda-tabs"><button className={tab === "calendars" ? "active" : ""} onClick={() => setTab("calendars")}><CalendarDays size={15} /> Agendas</button><button className={tab === "types" ? "active" : ""} onClick={() => setTab("types")}><Tag size={15} /> Tipos</button><button className={tab === "statuses" ? "active" : ""} onClick={() => setTab("statuses")}><Tag size={15} /> Status</button></div>
    <section className="agenda-catalog-card"><div className="agenda-catalog-head"><div><span className="eyebrow">{tab === "calendars" ? "AGENDAS" : tab === "types" ? "TIPOS" : "STATUS"}</span><h2>{tab === "calendars" ? "Agendas por setor" : tab === "types" ? "Tipos de agendamento" : "Status do compromisso"}</h2><p>{tab === "calendars" ? "Cada agenda é exibida apenas para colaboradores vinculados ao seu setor." : tab === "types" ? "Nenhuma opção padrão é criada automaticamente." : "A cor do status é aplicada diretamente no compromisso do calendário."}</p></div><button className="primary-button" onClick={() => tab === "calendars" ? setCalendar(null) : tab === "types" ? setType(null) : setStatus(null)}><Plus size={16} /> Novo</button></div>
      {tab === "calendars" && <CatalogList items={module.calendars} icon={<CalendarDays size={18} />} onEdit={(item) => setCalendar(item)} onDelete={(item) => void remove("deleteAgendaCalendar", item.id, "agenda")} render={(item) => <><strong>{item.name}</strong><small>{item.description || item.departmentName}</small></>} />}
      {tab === "types" && <CatalogList items={module.types} icon={<i className="agenda-type-dot" />} onEdit={(item) => setType(item)} onDelete={(item) => void remove("deleteAgendaType", item.id, "tipo de agendamento")} render={(item) => <><strong>{item.name}</strong><small>{item.description || `Cor de identificação: ${item.color}`}</small></>} />}
      {tab === "statuses" && <CatalogList items={module.statuses} icon={<i className="agenda-type-dot" />} onEdit={(item) => setStatus(item)} onDelete={(item) => void remove("deleteAgendaStatus", item.id, "status")} render={(item) => <><strong>{item.name}</strong><small>{item.description || `Cor aplicada ao agendamento: ${item.color}`}</small></>} />}
    </section>
    {calendar !== undefined && <CalendarForm item={calendar} departments={module.departments} busy={busy} onClose={() => setCalendar(undefined)} onSave={async (payload) => { const result = await operate({ action: "saveAgendaCalendar", id: calendar?.id, ...payload }, calendar ? "Agenda atualizada com sucesso." : "Agenda cadastrada com sucesso."); if (result) setCalendar(undefined); }} />}
    {type !== undefined && <NamedColorForm title="Tipo de agendamento" item={type} busy={busy} onClose={() => setType(undefined)} onSave={async (payload) => { const result = await operate({ action: "saveAgendaType", id: type?.id, ...payload }, type ? "Tipo atualizado com sucesso." : "Tipo cadastrado com sucesso."); if (result) setType(undefined); }} />}
    {status !== undefined && <NamedColorForm title="Status do compromisso" item={status} busy={busy} onClose={() => setStatus(undefined)} onSave={async (payload) => { const result = await operate({ action: "saveAgendaStatus", id: status?.id, ...payload }, status ? "Status atualizado com sucesso." : "Status cadastrado com sucesso."); if (result) setStatus(undefined); }} />}
  </>;
}

function MonthCalendar({ month, commitments, specialEvents, onPrevious, onNext, onOpen }: { month: Date; commitments: AgendaCommitment[]; specialEvents: AgendaSpecialEvent[]; onPrevious: () => void; onNext: () => void; onOpen: (entry: AgendaCommitment) => void }) {
  const days = useMemo(() => { const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = new Date(first); start.setDate(first.getDate() - first.getDay()); return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; }); }, [month]);
  const today = dayKey(new Date());
  return <section className="agenda-calendar-card"><header className="agenda-calendar-title"><button className="icon-button" onClick={onPrevious} aria-label="Mês anterior"><ChevronLeft size={19} /></button><h2>{monthFormatter.format(month)}</h2><button className="icon-button" onClick={onNext} aria-label="Próximo mês"><ChevronRight size={19} /></button></header><div className="agenda-weekdays">{Array.from({ length: 7 }, (_, index) => <span key={index}>{dayFormatter.format(new Date(2023, 0, index + 1)).replace(".", "")}</span>)}</div><div className="agenda-month-grid">{days.map((day) => { const key = dayKey(day); const commemorations = specialEvents.filter((entry) => entry.date === key); const entries = commitments.filter((entry) => dateKey(entry.startsAt) === key).sort((a, b) => a.startsAt.localeCompare(b.startsAt)); const visible = 3; const shownCommemorations = commemorations.slice(0, visible); const shownCommitments = entries.slice(0, Math.max(visible - shownCommemorations.length, 0)); const hidden = commemorations.length + entries.length - shownCommemorations.length - shownCommitments.length; const outside = day.getMonth() !== month.getMonth(); return <div className={`agenda-day ${outside ? "outside" : ""}`} key={key}><time className={key === today ? "today" : ""}>{day.getDate()}</time>{shownCommemorations.map((entry) => <div className={`agenda-event agenda-special-event ${entry.kind}`} key={entry.id} style={{ "--event-color": entry.color } as CSSProperties} title={`${entry.title} · ${entry.detail}`}><span>{entry.title}</span><small>dia inteiro</small></div>)}{shownCommitments.map((entry) => <button className="agenda-event" key={entry.id} onClick={() => onOpen(entry)} style={{ "--event-color": entry.statusColor } as CSSProperties}><span>{entry.title}</span><small>{time(entry.startsAt)}</small></button>)}{hidden > 0 && <span className="agenda-more">+{hidden} mais</span>}</div>; })}</div></section>;
}

function CommitmentModal({ module, commitment, busy, currentEmail, onClose, onSave }: { module: AgendaModuleData; commitment?: AgendaCommitment; busy: boolean; currentEmail: string; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  module = { ...module, calendars: module.calendars.filter((item) => item.active), types: module.types.filter((item) => item.active), statuses: module.statuses.filter((item) => item.active) };
  const [editing, setEditing] = useState(!commitment);
  const [agendaId, setAgendaId] = useState(commitment?.agendaId ?? module.calendars[0]?.id ?? "");
  const calendar = module.calendars.find((item) => item.id === agendaId);
  const collaborators = module.collaborators.filter((entry) => entry.departmentId === calendar?.departmentId);
  const canEdit = !commitment || commitment.createdBy.toLowerCase() === currentEmail.toLowerCase();
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const date = String(form.get("date")); const startTime = String(form.get("startTime")); const endTime = String(form.get("endTime")); onSave({ agendaId, agendaTypeId: form.get("agendaTypeId"), agendaStatusId: form.get("agendaStatusId"), responsibleUserId: form.get("responsibleUserId"), title: form.get("title"), description: form.get("description"), startsAt: new Date(`${date}T${startTime}:00`).toISOString(), endsAt: new Date(`${date}T${endTime}:00`).toISOString(), participantUserIds: form.getAll("participantUserIds"), recurrence: form.get("recurrence") }); };
  const disabled = !editing;
  return <AgendaModal title={commitment ? "Compromisso" : "Novo compromisso"} onClose={onClose}><form className="form-grid agenda-form" onSubmit={submit}><label className="wide">Título *<input name="title" required disabled={disabled} defaultValue={commitment?.title} placeholder="Nome do compromisso" /></label><label>Agenda *<select value={agendaId} disabled={disabled} onChange={(event) => setAgendaId(event.target.value)}>{module.calendars.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.departmentName}</option>)}</select></label><label>Tipo *<select name="agendaTypeId" disabled={disabled} required defaultValue={commitment?.agendaTypeId ?? ""}><option value="">Selecionar...</option>{module.types.filter((item) => item.active || item.id === commitment?.agendaTypeId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Status *<select name="agendaStatusId" disabled={disabled} required defaultValue={commitment?.agendaStatusId ?? ""}><option value="">Selecionar...</option>{module.statuses.filter((item) => item.active || item.id === commitment?.agendaStatusId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Responsável *<select name="responsibleUserId" disabled={disabled} required defaultValue={commitment?.responsibleUserId ?? ""}><option value="">Selecionar responsável...</option>{collaborators.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Data *<input name="date" type="date" disabled={disabled} required defaultValue={commitment ? dateInput(commitment.startsAt) : ""} /></label><label>Hora início *<input name="startTime" type="time" disabled={disabled} required defaultValue={commitment ? timeInput(commitment.startsAt) : ""} /></label><label>Hora fim *<input name="endTime" type="time" disabled={disabled} required defaultValue={commitment ? timeInput(commitment.endsAt) : ""} /></label><label>Colaboradores<select name="participantUserIds" disabled={disabled} multiple size={1} defaultValue={commitment?.participantUserIds}>{collaborators.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="wide">Descrição<textarea name="description" rows={3} disabled={disabled} defaultValue={commitment?.description} placeholder="Detalhes do compromisso..." /></label>{!commitment && <fieldset className="wide agenda-recurrence"><legend>Repetir compromisso</legend><div><label><input type="radio" name="recurrence" value="none" defaultChecked /> Não repetir</label><label><input type="radio" name="recurrence" value="week" /> Semana atual</label><label><input type="radio" name="recurrence" value="month" /> Mês inteiro</label><label><input type="radio" name="recurrence" value="businessDays" /> Dias úteis do mês</label></div></fieldset>}<div className="form-actions wide"><button type="button" onClick={onClose}>Fechar</button>{canEdit && !editing && <button className="secondary-button" type="button" onClick={() => setEditing(true)}><Edit3 size={15} /> Editar</button>}{editing && <button className="primary-button" disabled={busy} type="submit"><Save size={16} /> {busy ? "Salvando..." : commitment ? "Salvar alterações" : "Criar compromisso"}</button>}</div></form></AgendaModal>;
}

function AgendaCommitmentModal({ module, commitment, busy, currentEmail, onClose, onSave, onDelete, onChangeStatus }: { module: AgendaModuleData; commitment?: AgendaCommitment; busy: boolean; currentEmail: string; onClose: () => void; onSave: (payload: Record<string, unknown>) => void; onDelete?: () => void; onChangeStatus?: (statusId: string) => Promise<boolean> }) {
  module = { ...module, calendars: module.calendars.filter((item) => item.active), types: module.types.filter((item) => item.active), statuses: module.statuses.filter((item) => item.active) };
  const [editing, setEditing] = useState(!commitment);
  const [agendaId, setAgendaId] = useState(commitment?.agendaId ?? module.calendars[0]?.id ?? "");
  const [quickStatusId, setQuickStatusId] = useState(commitment?.agendaStatusId ?? "");
  const [quickChanging, setQuickChanging] = useState(false);
  const calendar = module.calendars.find((item) => item.id === agendaId);
  const collaborators = module.collaborators.filter((entry) => entry.departmentId === calendar?.departmentId);
  const canEdit = !commitment || commitment.createdBy.toLowerCase() === currentEmail.toLowerCase();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date"));
    const startTime = String(form.get("startTime"));
    const endTime = String(form.get("endTime"));
    onSave({ agendaId, agendaTypeId: form.get("agendaTypeId"), agendaStatusId: form.get("agendaStatusId"), responsibleUserId: form.get("responsibleUserId"), title: form.get("title"), description: form.get("description"), startsAt: new Date(`${date}T${startTime}:00`).toISOString(), endsAt: new Date(`${date}T${endTime}:00`).toISOString(), participantUserIds: form.getAll("participantUserIds"), recurrence: form.get("recurrence") });
  };
  const changeQuickStatus = async (statusId: string) => {
    if (!commitment || !onChangeStatus || statusId === quickStatusId) return;
    const previous = quickStatusId;
    setQuickStatusId(statusId);
    setQuickChanging(true);
    const saved = await onChangeStatus(statusId);
    if (!saved) setQuickStatusId(previous);
    setQuickChanging(false);
  };
  const statusAction = commitment && canEdit ? <div className="agenda-modal-actions"><label className="agenda-quick-status"><span>Alterar status</span><select value={quickStatusId} disabled={busy || quickChanging} onChange={(event) => void changeQuickStatus(event.target.value)}>{module.statuses.filter((item) => item.active || item.id === commitment.agendaStatusId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="icon-button danger-action" type="button" disabled={busy} onClick={onDelete} title="Excluir compromisso"><Trash2 size={16} /></button></div> : null;
  const disabled = !editing;
  return <AgendaModal title={commitment ? "Compromisso" : "Novo compromisso"} onClose={onClose} headerAction={statusAction}>
    <form className="form-grid agenda-form" onSubmit={submit}>
      <label className="wide">Título *<input name="title" required disabled={disabled} defaultValue={commitment?.title} placeholder="Nome do compromisso" /></label>
      <label>Agenda *<select value={agendaId} disabled={disabled} onChange={(event) => setAgendaId(event.target.value)}>{module.calendars.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.departmentName}</option>)}</select></label>
      <label>Tipo *<select name="agendaTypeId" disabled={disabled} required defaultValue={commitment?.agendaTypeId ?? ""}><option value="">Selecionar...</option>{module.types.filter((item) => item.active || item.id === commitment?.agendaTypeId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Status *<select name="agendaStatusId" disabled={disabled} required defaultValue={commitment?.agendaStatusId ?? ""}><option value="">Selecionar...</option>{module.statuses.filter((item) => item.active || item.id === commitment?.agendaStatusId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Responsável *<select name="responsibleUserId" disabled={disabled} required defaultValue={commitment?.responsibleUserId ?? ""}><option value="">Selecionar responsável...</option>{collaborators.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Data *<input name="date" type="date" disabled={disabled} required defaultValue={commitment ? dateInput(commitment.startsAt) : ""} /></label>
      <label>Hora início *<input name="startTime" type="time" disabled={disabled} required defaultValue={commitment ? timeInput(commitment.startsAt) : ""} /></label>
      <label>Hora fim *<input name="endTime" type="time" disabled={disabled} required defaultValue={commitment ? timeInput(commitment.endsAt) : ""} /></label>
      <label>Colaboradores<select name="participantUserIds" disabled={disabled} multiple size={1} defaultValue={commitment?.participantUserIds}>{collaborators.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className="wide">Descrição<textarea name="description" rows={3} disabled={disabled} defaultValue={commitment?.description} placeholder="Detalhes do compromisso..." /></label>
      {!commitment && <fieldset className="wide agenda-recurrence"><legend>Repetir compromisso</legend><div><label><input type="radio" name="recurrence" value="none" defaultChecked /> Não repetir</label><label><input type="radio" name="recurrence" value="week" /> Semana atual</label><label><input type="radio" name="recurrence" value="month" /> Mês inteiro</label><label><input type="radio" name="recurrence" value="businessDays" /> Dias úteis do mês</label></div></fieldset>}
      <div className="form-actions wide"><button type="button" onClick={onClose}>Fechar</button>{canEdit && !editing && <button className="secondary-button" type="button" onClick={() => setEditing(true)}><Edit3 size={15} /> Editar</button>}{editing && <button className="primary-button" disabled={busy} type="submit"><Save size={16} /> {busy ? "Salvando..." : commitment ? "Salvar alterações" : "Criar compromisso"}</button>}</div>
    </form>
  </AgendaModal>;
}

function CatalogList<T extends { id: string; active: boolean; color?: string }>({ items, icon, render, onEdit, onDelete }: { items: T[]; icon: React.ReactNode; render: (item: T) => React.ReactNode; onEdit: (item: T) => void; onDelete: (item: T) => void }) { return <div className="agenda-catalog-list">{items.length === 0 ? <EmptyAgenda text="Nenhum cadastro encontrado." /> : items.map((item) => <article key={item.id}><span className="agenda-list-icon" style={item.color ? { color: item.color, background: `${item.color}18` } : undefined}>{icon}</span><span className="agenda-list-data">{render(item)}</span><b className={`status-pill ${item.active ? "positive" : "negative"}`}>{item.active ? "Ativo" : "Inativo"}</b><button className="catalog-icon-button" onClick={() => onEdit(item)} aria-label="Editar"><Edit3 size={15} /></button><button className="catalog-icon-button delete" onClick={() => onDelete(item)} aria-label="Excluir"><Trash2 size={15} /></button></article>)}</div>; }
function CalendarForm({ item, departments, busy, onClose, onSave }: { item: AgendaCalendar | null; departments: AgendaDepartment[]; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) { const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ name: form.get("name"), description: form.get("description"), departmentId: form.get("departmentId"), active: form.get("active") === "on" }); }; return <AgendaModal title={item ? "Editar agenda" : "Nova agenda"} onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="wide">Nome da agenda<input name="name" required defaultValue={item?.name} /></label><label className="wide">Descrição<textarea name="description" required maxLength={600} rows={3} defaultValue={item?.description} placeholder="Explique a finalidade desta agenda." /></label><label className="wide">Setor<select name="departmentId" required defaultValue={item?.departmentId ?? ""}><option value="">Selecionar setor...</option>{departments.filter((department) => department.active).map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select></label><label className="checkbox-label wide"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Agenda ativa</label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16} /> Salvar</button></div></form></AgendaModal>; }
function NamedColorForm({ title, item, busy, onClose, onSave }: { title: string; item: AgendaType | AgendaStatus | null; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) { const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ name: form.get("name"), description: form.get("description"), color: form.get("color"), active: form.get("active") === "on" }); }; return <AgendaModal title={item ? `Editar ${title.toLowerCase()}` : `Novo ${title.toLowerCase()}`} onClose={onClose}><form className="form-grid" onSubmit={submit}><label>Nome<input name="name" required defaultValue={item?.name} /></label><label>Cor<input name="color" type="color" defaultValue={item?.color ?? "#2563eb"} /></label><label className="wide">Descrição<textarea name="description" required maxLength={600} rows={3} defaultValue={item?.description} placeholder="Explique quando este cadastro deve ser utilizado." /></label><label className="checkbox-label wide"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Cadastro ativo</label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16} /> Salvar</button></div></form></AgendaModal>; }
function AgendaModal({ title, onClose, headerAction, children }: { title: string; onClose: () => void; headerAction?: React.ReactNode; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><div className="modal agenda-modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><span className="eyebrow">AGENDA</span><h2>{title}</h2></div>{headerAction}<button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>{children}</div></div>; }
function EmptyAgenda({ text }: { text: string }) { return <div className="agenda-empty"><CalendarDays size={22} /><p>{text}</p></div>; }
