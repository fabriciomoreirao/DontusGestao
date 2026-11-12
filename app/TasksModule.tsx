"use client";
import { canInteractWithTask } from "@/lib/task-interaction";
import { LinkedDevelopmentDrawer } from "@/app/DevelopmentModule";
import { desktopWhatsappUrl } from "@/lib/whatsapp";
import PhoneLink, { PhoneInput } from "@/app/PhoneLink";
import CommentInput, { CommentContent } from "@/app/CommentInput";
import CommentEditor from "@/app/CommentEditor";
import FormattedText from "@/app/FormattedText";
import ReminderAction, {openAgendaComposer} from "@/app/ReminderAction";
import DepartmentApproverFields from "@/app/DepartmentApproverFields";

import { beginKanbanDrag, readKanbanDrop } from "@/lib/kanban-drag";
import { canDragTask, canMoveTask } from "@/lib/task-movement";
import { taskAssignmentAccess } from "@/lib/task-assignment";

import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";

import { useReminderFilter } from "@/app/ReminderFilters";


import {
  ClipboardList, Zap, FileSpreadsheet, Layers, Flag, Network, Send, ChevronDown, Bell, CalendarDays, Check, CheckCircle2, ChevronRight, CircleDot, Clipboard, Clock3, Columns3,
  Code2, FileText, History, List, MessageSquareText, Paperclip, Pencil, Plus, Search,
  Power, RotateCcw, Settings, Smile, Trash2, UserRound, UsersRound, X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { createContext, FormEvent, useContext, useEffect, useMemo, useRef, useState } from "react";
import MediaUploadField from "@/app/MediaUploadField";
import CheckboxMultiSelect from "@/app/CheckboxMultiSelect";
import TaskClientNoticeModal from "@/app/TaskClientNoticeModal";
import { availableTaskDepartments, taskViewingDepartments, initialTaskStatuses, taskInitialSelection, taskTypesForDepartment } from "@/lib/task-catalogs";
import { taskUploadBatches } from "@/lib/task-upload";

export type TaskModuleData = {
  tasks: CorporateTask[];
  departments: Department[];
  types: TaskType[];
  priorities: Priority[];
  statuses: Status[];
  slaPolicies: Sla[];
  collaborators: Collaborator[];
  notifications: Notification[];
};
export type CatalogSection = "departments" | "types" | "priorities" | "statuses" | "kanban" | "sla" | "people";

const TaskCatalogActions = createContext<{ remove: (catalog: string, id: string, label: string) => Promise<void>; toggle: (catalog: string, id: string, label: string) => Promise<void> } | null>(null);

const mergeSelectedFiles = (current: File[], incoming: File[]) => {
  const files = [...current];
  for (const file of incoming) if (!files.some((entry) => entry.name === file.name && entry.size === file.size && entry.lastModified === file.lastModified)) files.push(file);
  return files;
};

type CorporateTask = {
  id: string; number: number; protocol: string; title: string; description: string;
  typeId: string; typeName: string; priorityId: string; priorityName: string; priorityColor: string;
  statusId: string; statusName: string; slaPolicyId: string | null; sourceDepartmentId: string; currentDepartmentId: string;
  departmentName: string; creatorUserId: string; creatorName: string; assigneeUserId: string | null;
  assigneeName: string; customerId: string | null; customerCode: string; customerName: string;
  clientWhatsApp: string; clientNotificationState: string; clientNotificationRequestedAt: string | null; clientNotifiedAt: string | null;
  externalLink: string; internalNotes: string; dueAt: string | null; slaDueAt: string | null;
  slaState: string; completedAt: string | null; cancelled: boolean; cancellationRequest: boolean; version: number;
  canModify: boolean;
  createdAt: string; updatedAt: string; comments: TaskComment[]; history: TaskHistory[];
  attachments: Array<{ id: string; fileName: string; url: string; sizeBytes?:number; createdAt: string }>;
  participantUserIds: string[]; approverUserId?: string | null;
};
type Department = { approverUserId?: string | null; id: string; name: string; description: string; active: boolean; requiresAssigneeOnTransfer: boolean; coordinatorUserIds: string[] };
type Priority = { id: string; name: string; severityOrder: number; color: string; defaultDueMinutes: number | null; active: boolean };
type Status = { id: string; name: string; departmentId: string | null; displayOrder: number; kanbanColumn: string; isInitial: boolean; isFinal: boolean; acceptsNewTasks: boolean; manualMovement: boolean; requiresJustification: boolean; active: boolean };
type TaskType = { id: string; name: string; description: string; defaultPriorityId: string | null; defaultSlaPolicyId: string | null; initialStatusId: string; departmentIds: string[]; allowedStatusIds: string[]; active: boolean };
type Sla = { id: string; name: string; departmentId: string; taskTypeId: string | null; priorityId: string | null; firstResponseMinutes: number; serviceStartMinutes: number; completionMinutes: number; businessDays: number[]; businessStart: string; businessEnd: string; alertBeforeMinutes: number; escalationMinutes: number; recalculateOnTransfer: boolean; pauseStatusIds: string[]; active: boolean };
type Collaborator = { id: string; name: string; email: string; phone: string; jobTitle: string; photoDataUrl: string; active: boolean; departmentIds: string[]; coordinatorDepartmentIds: string[] };
type Notification = { id: string; taskId: string; taskNumber: number; eventType: string; message: string; read: boolean; createdAt: string };
type TaskComment = { id: string; authorUserId: string; authorName: string; body: string; internal: boolean; createdAt: string; attachments: Array<{ id: string; commentId: string | null; fileName: string; url: string; sizeBytes?:number; createdAt: string }> };
type TaskHistory = { id: string; eventType: string; summary: string; actorName: string; previousValue: string; newValue: string; source: string; justification: string; createdAt: string };

export type CustomerOption = { id: string; trade_name: string; legal_name?: string; document_masked?: string };

const publicCustomerCode = (customer?: CustomerOption) => {
  const digits = customer?.document_masked?.replace(/\D/g, "") ?? "";
  return digits.length === 6 ? digits : "";
};

type LinkedDevelopmentItem = {id:string;module:string;record_type:string;title:string;customer_name:string;owner:string;team:string;status:string;priority:string;amount_cents:number;description:string;version:number;created_at:string;updated_at:string};
type Props = {
  linkedDevelopmentItems?: LinkedDevelopmentItem[];
  module: TaskModuleData;
  customers: CustomerOption[];
  user: { email: string; displayName: string; role: string; department: string; isCoordinator: boolean };
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  canRemind?:boolean;
  canSchedule?:boolean;
  capabilities: string[];
  busy: boolean;
  month: string;
  onMonthChange: (month: string) => void;
  operate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string; createdProtocol?: string } | false>;
  onSendToDevelopment: (task: CorporateTask) => Promise<{ id?: string; createdProtocol?: string } | false>;
  uploadAttachments: (taskId: string, files: File[], commentId?: string, onUploaded?: (files: File[]) => void) => Promise<boolean>;
  deleteAttachment: (attachmentId: string) => Promise<boolean>;
  onOpenSettings: () => void;
};

const dt = (value?: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "—";

export default function TasksModule({ linkedDevelopmentItems = [], module, customers, user, canCreate, canEdit, canManage, canRemind=false, canSchedule=false, capabilities, busy, month, onMonthChange, operate, onSendToDevelopment, uploadAttachments, deleteAttachment, onOpenSettings }: Props) {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [clientNotice, setClientNotice] = useState("Todos");
  const [selected, setSelected] = useState<CorporateTask | null>(null);
  const [editRequested, setEditRequested] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdTaskPendingUpload, setCreatedTaskPendingUpload] = useState<{ id?: string; createdProtocol?: string } | null>(null);
  const [createdProtocol, setCreatedProtocol] = useState("");
  const reminderFilter = useReminderFilter("tasks");
  const has = (capability: string) => canManage || capabilities.includes(capability);
  const currentCollaborator = module.collaborators.find((item) => item.email.toLowerCase() === user.email.toLowerCase());
  const movementAccessFor=(task:CorporateTask)=>({userId:currentCollaborator?.id,canEdit,canManage,changeStatus:has("changeStatus"),cancel:has("cancel"),canInteract:canInteractWithTask(task,currentCollaborator,canManage)});
  const canMoveTo=(task:CorporateTask,statusId:string)=>{const status=module.statuses.find(entry=>entry.id===statusId);return !busy&&Boolean(status&&canMoveTask(task,status,module.types,movementAccessFor(task)));};
  const creationDepartments = availableTaskDepartments(module.departments, currentCollaborator, has("viewOtherDepartments"));
  const availableDepartments = taskViewingDepartments(module.departments, currentCollaborator, has("viewOtherDepartments"), module.tasks.filter(task=>task.assigneeUserId===currentCollaborator?.id).map(task=>task.currentDepartmentId));
  const departmentFilter = availableDepartments.some((item) => item.id === department) ? department : "";
  const priorityFilter = module.priorities.some((item) => item.id === priority && item.active) ? priority : "";
  const assigneeFilter = module.collaborators.some((item) => item.id === assignee && item.active) ? assignee : "";
  const selectedDepartment = module.departments.find((item) => item.id === departmentFilter);
  const openCount = module.tasks.filter((task) => !task.completedAt && !task.cancelled).length;
  const attentionCount = module.tasks.filter((task) => /Vencido|Próximo/.test(task.slaState)).length;
  const queueCount = module.tasks.filter((task) => !task.assigneeUserId).length;
  const unreadCount = module.notifications.filter((notification) => !notification.read).length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return module.tasks.filter((task) => {
      const text = `#${task.number} ${task.protocol} ${task.title} ${task.description} ${task.customerName}`.toLocaleLowerCase("pt-BR");
      return reminderFilter.matches({ entityId: task.id, clientId: task.customerCode, title: task.title }) && (!needle || text.includes(needle))
        && (!departmentFilter || task.currentDepartmentId === departmentFilter)
        && (!priorityFilter || task.priorityId === priorityFilter)
        && (!assigneeFilter || task.assigneeUserId === assigneeFilter)
        && (clientNotice === "Todos" || task.clientNotificationState === clientNotice)
        && (!onlyMine || (currentCollaborator ? task.assigneeUserId === currentCollaborator.id : task.assigneeName === user.displayName));
    });
  }, [module.tasks, query, departmentFilter, priorityFilter, assigneeFilter, clientNotice, onlyMine, currentCollaborator, user.displayName, reminderFilter.matches]);

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get("task");
    const direct = module.tasks.find((task) => task.id === taskId || task.protocol === taskId);
    if (direct) setSelected(direct);
  }, [module.tasks]);


  const openTask = (task: CorporateTask, edit = false) => {
    setEditRequested(edit);
    setSelected(task);
    const url = new URL(window.location.href); url.searchParams.set("mod", "tasks"); url.searchParams.set("task", task.id);
    window.history.replaceState({}, "", url);
  };
  const closeTask = () => {
    setSelected(null);
    setEditRequested(false);
    const url = new URL(window.location.href); url.searchParams.delete("task"); window.history.replaceState({}, "", url);
  };

  const move = async (task: CorporateTask, statusId: string) => {
    if (busy || !canMoveTo(task,statusId) || task.statusId === statusId) return;
    const target = module.statuses.find((status) => status.id === statusId);
    const justification = target?.requiresJustification ? window.prompt("Justificativa obrigatória:") : "";
    if (target?.requiresJustification && !justification) return;
    await operate({ action: "changeTaskStatus", taskId: task.id, statusId, justification, version: task.version }, `Tarefa movida para ${target?.name}.`);
  };

  return <div className="tasks-module">
    <header className="tasks-heading module-page-header">
      <div className="module-page-title"><span className="module-page-title-icon"><Clipboard size={21} /></span><span className="module-page-copy"><span className="eyebrow">OPERAÇÃO CORPORATIVA</span><h1>Tarefas</h1><p>Demandas internas, responsáveis, setores e SLA em um fluxo auditável.</p></span></div>
      <div className="tasks-heading-actions module-page-actions">
        <label className="tasks-competence-filter"><CalendarDays size={16} /><span>Competência</span><input type="month" aria-label="Filtrar tarefas por competência" value={month} onChange={event => { if (event.target.value) onMonthChange(event.target.value); }} /></label>
        <button type="button" className="task-settings-button icon-only" onClick={onOpenSettings} aria-label="Configurar opções de tarefas" title="Configurar tipos, prioridades, SLA, status e Kanban"><Settings size={17} /></button>
        {canCreate && <button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Nova tarefa</button>}
      </div>
    </header>
    <div className="tasks-summary" aria-label="Resumo das tarefas">
      <div><strong>{openCount}</strong><span>Em aberto</span></div>
      <i />
      <div><strong>{queueCount}</strong><span>Na fila do setor</span></div>
      <i />
      <div className={attentionCount > 0 ? "attention" : ""}><strong>{attentionCount}</strong><span>SLA exige atenção</span></div>
      <i />
      <div><strong>{unreadCount}</strong><span>Notificações novas</span></div>
    </div>
    <section className="task-workspace">
      <header className="task-workspace-heading">
        <div><span>QUADRO ATUAL</span><strong>{selectedDepartment?.name ?? "Visão consolidada"}</strong><small>{filtered.length} tarefa(s) nesta visualização</small></div>
        <div className="tasks-view-switch">
          <button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}><Columns3 size={16} /> Kanban</button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={16} /> Lista</button>
        </div>
      </header>
      <div className="tasks-toolbar reminder-filter-toolbar compact-operational-filters task-compact-filters" role="group" aria-label="Filtros de tarefas">
        <label className="task-sector-control"><span>Setor</span><select aria-label="Filtrar tarefas por setor" value={departmentFilter} onChange={(event) => setDepartment(event.target.value)}><option value="">Todos os setores</option>{availableDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="task-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por protocolo, título ou cliente" /></div>{reminderFilter.control}
        <select value={priorityFilter} onChange={(e) => setPriority(e.target.value)} aria-label="Filtrar prioridade"><option value="">Todas as prioridades</option>{module.priorities.filter((p) => p.active).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select>
        <SearchablePeopleSelect searchLabel="Responsável" value={assigneeFilter} onChange={(e) => setAssignee(e.target.value)} aria-label="Filtrar responsável"><option value="">Todos os responsáveis</option>{module.collaborators.filter((c) => c.active).map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</SearchablePeopleSelect>

        <label className="mine-filter"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Somente minhas</label>
        <label className="task-client-notice-filter"><span>Comunicação com o cliente</span><select aria-label="Filtrar comunicação com o cliente" value={clientNotice} onChange={event => setClientNotice(event.target.value)}>{["Todos", "Avisar Cliente", "Sem Necessidade", "Cliente Informado", "Pendente"].map(state => <option value={state} key={state}>{state === "Todos" ? "Todos os estados" : state} ({state === "Todos" ? module.tasks.length : module.tasks.filter(task => task.clientNotificationState === state).length})</option>)}</select></label>
      </div>
      <div className="task-workspace-content">
        {view === "kanban" && <Kanban tasks={filtered} statuses={module.statuses} collaborators={module.collaborators} departmentId={departmentFilter} canEdit={canEdit} canDrag={task=>canDragTask(task,movementAccessFor(task))} canMoveTo={canMoveTo} busy={busy} onOpen={openTask} onEdit={task=>openTask(task,true)} onMove={move} onDelete={task=>{void operate({action:"deleteTask",taskId:task.id,version:task.version},"Tarefa excluída com sucesso.")}} />}
        {view === "list" && <TaskList tasks={filtered} collaborators={module.collaborators} onOpen={openTask} />}
      </div>
    </section>

    {creating && <CreateTaskModal module={module} customers={customers} user={user} departmentIds={creationDepartments.map((item) => item.id)} initialDepartmentId={departmentFilter} busy={busy} attachmentsOnly={!!createdTaskPendingUpload} onClose={() => { setCreating(false); setCreatedTaskPendingUpload(null); }} onSubmit={async (payload, files, onUploaded) => {
      const result = createdTaskPendingUpload ?? await operate({ action: "createTask", ...payload }, "Tarefa criada, protocolo e SLA calculados.");
      if (!result) return;
      if (result.id && files.length > 0 && !await uploadAttachments(result.id, files, undefined, onUploaded)) {
        setCreatedTaskPendingUpload(result);
        return;
      }
      setCreating(false);
      setCreatedTaskPendingUpload(null);
      setCreatedProtocol(result.createdProtocol ?? "");
    }} />}
    {selected && <TaskDetail linkedDevelopmentItems={linkedDevelopmentItems} task={module.tasks.find((t) => t.id === selected.id) ?? selected} module={module} customers={customers} user={user} canManage={canManage} canEdit={canEdit} canRemind={canRemind} canSchedule={canSchedule} startEditing={editRequested} has={has} busy={busy} onClose={closeTask} operate={operate} onSendToDevelopment={onSendToDevelopment} uploadAttachments={uploadAttachments} deleteAttachment={deleteAttachment} />}
    {createdProtocol && <TaskCreatedModal protocol={createdProtocol} onClose={() => setCreatedProtocol("")} />}
  </div>;
}

function Kanban({ tasks, statuses, collaborators, departmentId, canEdit, canDrag, canMoveTo, busy, onOpen, onEdit, onMove, onDelete }: { tasks: CorporateTask[]; statuses: Status[]; collaborators: Collaborator[]; departmentId: string; canEdit: boolean; canDrag:(task:CorporateTask)=>boolean; canMoveTo:(task:CorporateTask,statusId:string)=>boolean; busy: boolean; onOpen: (task: CorporateTask) => void; onEdit: (task: CorporateTask) => void; onMove: (task: CorporateTask, statusId: string) => void; onDelete: (task: CorporateTask) => void }) {
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [draggedId,setDraggedId]=useState("");
  const visibleStatuses = statuses
    .filter((status) => status.active && (!departmentId || !status.departmentId || status.departmentId === departmentId))
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return <div className="task-board">{visibleStatuses.map((status) => {
    const column = tasks.filter((task) => task.statusId === status.id);
    const limit = limits[status.id] ?? 10;
    const visibleTasks = column.slice(0, limit);
    return <section className="task-column" key={status.id} onDragOver={(e) => {
      const task=tasks.find(entry=>entry.id===draggedId);
      if(task&&canMoveTo(task,status.id)){e.preventDefault();e.dataTransfer.dropEffect="move";e.currentTarget.classList.add("drag-over");}
    }} onDragLeave={event=>event.currentTarget.classList.remove("drag-over")} onDrop={(e) => {
      e.preventDefault();e.stopPropagation();e.currentTarget.classList.remove("drag-over");setDraggedId("");
      const task = tasks.find((entry) => entry.id === readKanbanDrop(e, "taskId"));
      if (task&&canMoveTo(task,status.id)) void onMove(task, status.id);
    }}>
      <header><span><CircleDot size={14} />{status.kanbanColumn || status.name}</span><b>{column.length}</b></header>
      <div>{column.length === 0 && <p className="task-column-empty">Nenhuma tarefa nesta etapa.</p>}{visibleTasks.map((task) => <article draggable={!busy&&canDrag(task)} tabIndex={0} role="button" className={`task-card ${task.completedAt ? "completed" : task.slaState === "Vencido" ? "overdue" : ""}`} data-reminder-entity-id={task.id} data-reminder-client-id={task.customerCode} data-reminder-customer-name={task.customerName} key={task.id}
        onDragStart={(e) => {beginKanbanDrag(e, "taskId", task.id);setDraggedId(task.id);}} onDragEnd={()=>{setDraggedId("");document.querySelectorAll(".task-column.drag-over").forEach(column=>column.classList.remove("drag-over"));}} onClick={() => onOpen(task)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(task); } }}>
        <div className="task-card-heading"><strong className="task-card-title">{task.title}</strong><TaskClientStateBadge state={task.clientNotificationState}/></div>
        <div className="task-card-labels"><span className="task-card-type"><CircleDot size={13}/>{task.typeName}</span></div>
        <div className="task-card-meta"><span className="task-card-priority"><i style={{ background: task.priorityColor }}/>{task.priorityName}</span><span className={`sla-chip ${task.completedAt ? "completed" : task.slaState.toLowerCase().replaceAll(" ", "-")}`}><Clock3 size={12} /> {task.completedAt ? "Concluída" : `${task.slaState} · ${dt(task.slaDueAt)}`}</span></div>
        <footer><span className="task-card-department"><UsersRound size={14} /> {task.departmentName}</span><span className="task-card-owner"><CollaboratorAvatar collaborator={collaborators.find((item) => item.id === task.assigneeUserId)} /><span><small>Responsável</small><b>{task.assigneeName}</b></span><ChevronRight size={17} className="task-card-open-icon" /></span></footer>{canEdit && task.canModify && <div className="task-card-bottom-actions"><span className="task-card-actions"><button type="button" onClick={event => { event.stopPropagation(); onEdit(task); }} title="Editar tarefa" aria-label="Editar tarefa"><Pencil size={15}/></button><button type="button" className="delete" onClick={event => { event.stopPropagation(); onDelete(task); }} title="Excluir tarefa" aria-label="Excluir tarefa"><Trash2 size={15}/></button></span></div>}
      </article>)}{column.length > visibleTasks.length && <button type="button" className="task-column-more" onClick={() => setLimits((current) => ({ ...current, [status.id]: limit + 10 }))}>Ver mais ({column.length - visibleTasks.length})</button>}</div>
    </section>;
  })}</div>;
}

function TaskProtocolChip({protocol}:{protocol:string}){
 const [copied,setCopied]=useState(false);
 return <button type="button" className="task-protocol-chip" aria-label={`Copiar protocolo ${protocol}`} title={copied?"Protocolo copiado":"Copiar protocolo"} onClick={async event=>{event.preventDefault();event.stopPropagation();await navigator.clipboard.writeText(protocol);setCopied(true)}}><Clipboard size={15}/><span><small>Protocolo:</small><strong>{protocol}</strong></span>{copied?<Check size={15}/>:<Clipboard size={15}/>}</button>;
}

function TaskList({ tasks, collaborators, onOpen }: { tasks: CorporateTask[]; collaborators: Collaborator[]; onOpen: (task: CorporateTask) => void }) {
  return <div className="task-table"><div className="task-table-row head"><span>Código / tarefa</span><span>Tipo</span><span>Setor</span><span>Prioridade</span><span>Status</span><span>Responsável</span><span>Prazo / SLA</span><span>Atualização</span></div>
    {tasks.length === 0 ? <div className="task-empty">Nenhuma tarefa encontrada com estes filtros.</div> : tasks.map((task) => <button className="task-table-row" data-reminder-entity-id={task.id} data-reminder-client-id={task.customerCode} data-reminder-customer-name={task.customerName} onClick={() => onOpen(task)} key={task.id}>
      <span><b>#{task.number} · {task.title}</b><small>{task.protocol || task.customerName || "Sem protocolo"}</small></span>
      <span>{task.typeName}</span><span>{task.departmentName}</span>
      <span><i className="priority-dot" style={{ background: task.priorityColor }} />{task.priorityName}</span>
      <span><b>{task.statusName}</b><small className="task-list-client-state">{task.clientNotificationState}</small></span><span className="task-assignee"><CollaboratorAvatar collaborator={collaborators.find((item) => item.id === task.assigneeUserId)} /><em>{task.assigneeName}</em></span>
      <span><b className={task.slaState === "Vencido" ? "danger-text" : ""}>{task.slaState}</b><small>{dt(task.slaDueAt)}</small></span>
      <span>{dt(task.updatedAt)}<ChevronRight size={15} /></span>
    </button>)}</div>;
}

function CollaboratorAvatar({ collaborator }: { collaborator?: Collaborator }) {
  if (!collaborator) return <span className="task-assignee-avatar"><UserRound size={12} /></span>;
  const initials = collaborator.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className={`task-assignee-avatar ${collaborator.photoDataUrl ? "has-photo" : ""}`} style={collaborator.photoDataUrl ? { backgroundImage: `url("${collaborator.photoDataUrl}")` } : undefined}>{!collaborator.photoDataUrl && initials}</span>;
}

function TaskClientStateBadge({state}:{state:string}){
  const normalized=state||"Pendente";const tone=normalized==="Cliente Informado"?"informed":normalized==="Sem Necessidade"?"no-need":normalized==="Avisar Cliente"?"notify":"pending";
  return <span className={`task-client-state ${tone}`}>{normalized==="Cliente Informado"?<CheckCircle2 size={12}/>:normalized==="Sem Necessidade"?<Check size={12}/>:<Bell size={12}/>} {normalized}</span>
}

export function CreateTaskModal({ module, customers, user, departmentIds, initialDepartmentId, busy, initial, attachmentsOnly = false, customerLocked = false, onClose, onSubmit }: { module: TaskModuleData; customers: CustomerOption[]; user: Props["user"]; departmentIds: string[]; initialDepartmentId?: string; busy: boolean; attachmentsOnly?: boolean; customerLocked?: boolean; initial?: { title?: string; description?: string; customerId?: string; customerCode?: string; clientWhatsApp?: string }; onClose: () => void; onSubmit: (payload: Record<string, unknown>, files: File[], onUploaded: (files: File[]) => void) => void }) {
  const originDepartment = module.departments.find((department) => department.active && departmentIds.includes(department.id) && department.id === initialDepartmentId)
    ?? module.departments.find((department) => department.active && departmentIds.includes(department.id) && department.name.toLocaleLowerCase("pt-BR") === user.department.toLocaleLowerCase("pt-BR"))
    ?? module.departments.find((department) => department.active && departmentIds.includes(department.id));
  const [departmentId, setDepartmentId] = useState(originDepartment?.id ?? "");
  const [requestedTypeId, setRequestedTypeId] = useState("");
  const validTypes = taskTypesForDepartment(module.types, departmentId);
  const selectedType = validTypes.find(type => type.id === requestedTypeId);
  const initialStatus = module.statuses.find(status => status.id === selectedType?.initialStatusId && status.active && status.acceptsNewTasks && !status.isFinal
    && (!status.departmentId || status.departmentId === departmentId));
  const selectedDepartment = module.departments.find((department) => department.id === departmentId);
  const sectorCoordinators = module.collaborators.filter((item) => item.active && selectedDepartment?.coordinatorUserIds.includes(item.id)).sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [customerCode, setCustomerCode] = useState(initial?.customerCode ?? publicCustomerCode(customers.find(customer => customer.id === initial?.customerId)));
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const resolveCustomerCode = (value: string) => {
    setCustomerCode(value);
    const digits = value.replace(/\D/g, "");
    const customer = customers.find((item) => digits.length === 6 && publicCustomerCode(item) === digits);
    setCustomerId(customer?.id ?? "");
  };
  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((item) => item.id === id);
    if (customer) setCustomerCode(publicCustomerCode(customer));
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try { taskUploadBatches(files); } catch (error) { setFileError(error instanceof Error ? error.message : "Confira os arquivos selecionados."); return; }
    setFileError("");
    const f = new FormData(e.currentTarget);
    onSubmit({
      title: f.get("title"), description: f.get("description"),
      typeId: f.get("typeId"), priorityId: null, statusId: null,
      sourceDepartmentId: departmentId, currentDepartmentId: departmentId, assigneeUserId: null,
      customerId: customerId || null, customerCode, customerName: customers.find(customer => customer.id === customerId)?.trade_name ?? "",
      clientWhatsApp: f.get("clientWhatsApp"), internalNotes: "", dueAt: null, slaPolicyId: null,
      cancellationRequest: false,
      participantUserIds: f.getAll("participantUserIds"),
    }, files, sent => setFiles(current => current.filter(file => !sent.includes(file))));
  };
  return <Overlay title={attachmentsOnly ? "Enviar anexos da tarefa" : "Nova tarefa"} eyebrow="TAREFAS" subtitle="Informe a solicitação. A coordenação fará a classificação após o cadastro." onClose={onClose}><form className="task-form task-create-form" onSubmit={submit}>
    {attachmentsOnly && <p className="wide" role="alert">A tarefa foi criada, mas os anexos não foram enviados. Reenvie os arquivos para concluir.</p>}
    {!attachmentsOnly && <section className="task-form-section wide">
      <header><span>01</span><div><h3>Solicitação</h3><p>Descreva de forma simples o que precisa ser analisado.</p></div></header>
      <div className="task-form-section-grid">
        <label className="wide">Título *<input name="title" required defaultValue={initial?.title} placeholder="Resuma a demanda em uma frase" /></label>
        <label className="task-customer-code-field">ID do cliente *<input name="customerCode" readOnly={customerLocked} inputMode="numeric" maxLength={6} pattern="\d{6}" required value={customerCode} onChange={(event) => resolveCustomerCode(event.target.value.replace(/\D/g, "").slice(0,6))} placeholder="000000" /><small className={customerId ? "task-customer-linked" : undefined}>{customerId ? "Cliente vinculado pelo ID Dontus" : "Informe os 6 dígitos do ID Dontus do cliente."}</small></label>
        <label>Cliente<select name="customerId" disabled={customerLocked} value={customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">Sem cliente vinculado</option>{customers.map((c) => <option value={c.id} key={c.id}>{c.trade_name}</option>)}</select></label>
        <label>WhatsApp do cliente *<PhoneInput name="clientWhatsApp" type="tel" required minLength={10} defaultValue={initial?.clientWhatsApp} placeholder="(11) 99999-9999" /></label>
        <label>Setor responsável *<select name="departmentId" required value={departmentId} onChange={event => { setDepartmentId(event.target.value); setRequestedTypeId(""); }}><option value="">Selecione o setor</option>{module.departments.filter(department => department.active && departmentIds.includes(department.id)).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select>{!departmentIds.length && <small>Nenhum setor ativo disponível para seu usuário. Confira os vínculos ou as permissões de Tarefas.</small>}</label>
        <div className="task-readonly-field"><span>Aprovador</span><strong>{sectorCoordinators.find(person => person.id === selectedDepartment?.approverUserId)?.name || "Coordenador do setor não cadastrado"}</strong><small>A conclusão ficará pendente até a aprovação do coordenador.</small></div>
        <label className="wide">Tipo de tarefa *<select name="typeId" required value={selectedType?.id ?? ""} onChange={event => setRequestedTypeId(event.target.value)}><option value="">Selecionar...</option>{validTypes.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select>{departmentId && !validTypes.length && <small>Nenhum tipo ativo vinculado a este setor. Configure o vínculo em Cadastros → Tipos de tarefa.</small>}</label>
        {selectedType && <div className="task-readonly-field wide"><span>Etapa inicial</span><strong>{initialStatus?.name ?? "Este tipo precisa de uma etapa inicial ativa. Revise o cadastro do tipo."}</strong></div>}
        <label className="wide">Resumo detalhado *<textarea name="description" required rows={6} defaultValue={initial?.description} placeholder="Explique o problema, o resultado esperado e as informações necessárias para a análise." /></label>
      </div>
    </section>}
    <section className="task-form-section wide">
      <header><span>02</span><div><h3>Acesso e evidências</h3><p>Inclua participantes e arquivos somente quando forem necessários.</p></div></header>
      <div className="task-form-section-grid">
        {!attachmentsOnly && <CheckboxMultiSelect label="Colaboradores participantes" name="participantUserIds" options={module.collaborators.filter(item => item.active).map(item => ({ id: item.id, label: item.name }))} disabled={busy} hint="Todos os colaboradores do setor podem consultar a tarefa. Participantes acompanham a execução." />}
        <MediaUploadField className="wide" label="Imagens, vídeos e documentos" name="files" disabled={busy} multiple selectedFiles={files} onRemoveFile={index=>setFiles(current=>current.filter((_,i)=>i!==index))} selectedText={files.length ? `${files.length} arquivo(s) selecionado(s)` : undefined} hint="Selecione vários arquivos de uma vez ou adicione outros depois. Até 10 arquivos, com no máximo 25 MB cada." onChange={(event) => { const selectedFiles = Array.from(event.currentTarget.files ?? []); setFiles(current => mergeSelectedFiles(current, selectedFiles)); }} />
      </div>
    </section>
    {fileError && <p className="wide" role="alert">{fileError}</p>}
    <div className="task-form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || (!attachmentsOnly && (!departmentId || !selectedType || !initialStatus))}>{busy ? "Salvando..." : attachmentsOnly ? "Reenviar anexos" : "Criar tarefa"}</button></div>
  </form></Overlay>;
}

function TaskEditPortal({children}:{children:React.ReactNode}) {
 const [host,setHost]=useState<Element|null>(null);
 useEffect(()=>{setHost(document.querySelector(".app-shell")||document.body)},[]);
 return host ? createPortal(children,host) : null;
}

function EditTaskModal({ task, module, customers, busy, onClose, onSubmit }: { task: CorporateTask; module: TaskModuleData; customers: CustomerOption[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const validTypes = module.types.filter((type) => type.active && type.departmentIds.includes(task.currentDepartmentId));
  const [customerId, setCustomerId] = useState(task.customerId ?? "");
  const [customerCode, setCustomerCode] = useState(task.customerCode);
  const resolveCustomerCode = (value: string) => {
    setCustomerCode(value);
    const digits = value.replace(/\D/g, "");
    const customer = customers.find((item) => digits.length === 6 && publicCustomerCode(item) === digits);
    setCustomerId(customer?.id ?? "");
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      title: form.get("title"), description: form.get("description"), typeId: form.get("typeId"),
      customerId: customerId || null, customerCode, customerName: customers.find(customer => customer.id === customerId)?.trade_name ?? "",
      clientWhatsApp: form.get("clientWhatsApp"), cancellationRequest: false,
      participantUserIds: form.getAll("participantUserIds"), version: task.version,
    });
  };
  return <Overlay title="Editar tarefa" eyebrow={task.protocol} subtitle="Atualize somente as informações da solicitação." onClose={onClose}><form className="task-form task-edit-form" onSubmit={submit}>
    <label className="wide">Título *<input name="title" required defaultValue={task.title} /></label>
    <label>Cliente<select name="customerId" value={customerId} onChange={(event) => { setCustomerId(event.target.value); const customer = customers.find((item) => item.id === event.target.value); if (customer) setCustomerCode(publicCustomerCode(customer)); }}><option value="">Sem cliente vinculado</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name}</option>)}</select></label>
    <label>ID do cliente<input name="customerCode" inputMode="numeric" maxLength={6} pattern="\d{6}" required value={customerCode} onChange={(event) => resolveCustomerCode(event.target.value.replace(/\D/g, "").slice(0,6))} placeholder="000000" />{customerId && <small className="task-customer-linked">Cliente vinculado automaticamente</small>}</label>
    <label>WhatsApp do cliente *<PhoneInput name="clientWhatsApp" required minLength={10} defaultValue={task.clientWhatsApp} /></label>
    <label>Tipo *<select name="typeId" required defaultValue={task.typeId}>{validTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
    <label className="wide">Resumo detalhado *<textarea name="description" required rows={6} defaultValue={task.description} /></label>
    <CheckboxMultiSelect label="Colaboradores participantes" name="participantUserIds" options={module.collaborators.filter(item => item.active).map(item => ({ id: item.id, label: item.name }))} defaultValue={task.participantUserIds} disabled={busy} />
    <div className="task-form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</button></div>
  </form></Overlay>;
}

export function TaskDetail({ linkedDevelopmentItems = [], task, module, customers, user, canManage, canEdit:moduleCanEdit, canRemind, canSchedule, startEditing, has, busy, onClose, operate, onSendToDevelopment, uploadAttachments, deleteAttachment }: { linkedDevelopmentItems?: LinkedDevelopmentItem[]; task: CorporateTask; module: TaskModuleData; customers: CustomerOption[]; user: Props["user"]; canManage: boolean; canEdit: boolean; canRemind:boolean; canSchedule:boolean; startEditing: boolean; has: (cap: string) => boolean; busy: boolean; onClose: () => void; operate: Props["operate"]; onSendToDevelopment: Props["onSendToDevelopment"]; uploadAttachments: Props["uploadAttachments"]; deleteAttachment: Props["deleteAttachment"] }) {
  const canInteract = canInteractWithTask(task,module.collaborators.find(person=>person.email.toLowerCase()===user.email.toLowerCase()),canManage);
  const canEdit = moduleCanEdit && canInteract;
  const [comment, setComment] = useState("");
  const [commentLimit, setCommentLimit] = useState(5);
  const [historyLimit, setHistoryLimit] = useState(5);
  const commentsByDate = [...task.comments].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
  const historyByDate = [...task.history].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  useEffect(()=>{setCommentLimit(5);setHistoryLimit(5)},[task.id]);
  const [transferDepartment, setTransferDepartment] = useState(module.departments.find((department) => department.active && department.id !== task.currentDepartmentId)?.id ?? "");
  const [transferAssignee, setTransferAssignee] = useState(task.assigneeUserId ?? "");
  const [transferReason, setTransferReason] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [showEmojis, setShowEmojis] = useState(false);
  const [clientNoticeOpen, setClientNoticeOpen] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; name: string; video: boolean; temporary?: boolean } | null>(null);
  const [editingCommentId, setEditingCommentId] = useState("");
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [clientNoticeMessage, setClientNoticeMessage] = useState(`Avisar o cliente sobre a tarefa ${task.protocol}.`);
  const [editing, setEditing] = useState(startEditing && canEdit && task.canModify);
  const [sentToDevelopment, setSentToDevelopment] = useState(false);
  const [linkedDrawer, setLinkedDrawer] = useState(false);
  const linkedDevelopment = linkedDevelopmentItems.find(item=>{try{return JSON.parse(item.description).sourceTaskId===task.id}catch{return false}});
  const [developmentSubtaskId, setDevelopmentSubtaskId] = useState(() => task.comments.map((entry) => entry.body.match(/\[TI:([^\]]+)\]/)?.[1]).find(Boolean) ?? "");
  const [responsibleUserId, setResponsibleUserId] = useState(task.assigneeUserId ?? "");
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const availableAssignees = module.collaborators.filter(collaborator=>collaborator.active);
  const currentCollaborator = module.collaborators.find(collaborator=>collaborator.email.toLocaleLowerCase()===user.email.toLocaleLowerCase());
  const currentUserId = currentCollaborator?.id;
  const {canClaim,canTransfer:canTransferResponsible} = taskAssignmentAccess(task,currentCollaborator);
  const responsibleChoices = canClaim ? availableAssignees.filter(collaborator=>collaborator.id===currentUserId) : availableAssignees;
  useEffect(()=>{setResponsibleUserId(task.assigneeUserId??"");setTransferAssignee(task.assigneeUserId??"")},[task.id,task.assigneeUserId]);
  const isAssignee = Boolean(currentUserId && task.assigneeUserId === currentUserId);
  const canRunWorkflow = isAssignee || canEdit && has("changeStatus");
  const canForwardTask = isAssignee || canEdit && has("forward") && (canManage || user.isCoordinator);
  const taskType = module.types.find((type) => type.id === task.typeId);
  const availableStatuses = module.statuses.filter(status=>status.id===task.statusId||canMoveTask(task,status,module.types,{userId:currentUserId,canEdit,canManage,changeStatus:has("changeStatus"),cancel:has("cancel")}));
  const finalStatus = availableStatuses.find((status) => status.isFinal && !/cancel/i.test(status.name) && /conclu|finaliz|resolvid/i.test(status.name)) ?? availableStatuses.find((status) => status.isFinal && !/cancel/i.test(status.name));
  const approvalStatus = availableStatuses.find((status) => /aguardando\s+aprova/i.test(status.name));
  const approverUserId = task.approverUserId ?? "";
  const approver = module.collaborators.find((item) => item.id === approverUserId);
  const canApprove = canManage || user.isCoordinator || (!!approverUserId && approverUserId === module.collaborators.find((item) => item.email.toLowerCase() === user.email.toLowerCase())?.id);
  const resumeStatus = availableStatuses.find((status) => !status.isFinal && status.isInitial) ?? availableStatuses.find((status) => !status.isFinal);
  const insertEmoji = (emoji: string) => {
    const input = commentInput.current;
    const start = input?.selectionStart ?? comment.length;
    const end = input?.selectionEnd ?? start;
    const next = `${comment.slice(0, start)}${emoji}${comment.slice(end)}`;
    setComment(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };
  const [pendingCommentId, setPendingCommentId] = useState<string | null>(null);
  const [commentError, setCommentError] = useState("");
  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy || !comment.trim()) return;
    try { taskUploadBatches(commentFiles); } catch (error) { setCommentError(error instanceof Error ? error.message : "Confira os arquivos selecionados."); return; }
    setCommentError("");
    const result = pendingCommentId ? { id: pendingCommentId } : await operate({ action: "addTaskComment", taskId: task.id, body: comment }, "Comentário registrado.");
    if (!result) return;
    if (commentFiles.length) {
      if (!result.id) { setCommentError("O comentário foi salvo, mas não foi possível vincular os arquivos. Reabra a tarefa para anexá-los."); return; }
      setPendingCommentId(result.id);
      if (!await uploadAttachments(task.id, commentFiles, result.id, sent => setCommentFiles(current => current.filter(file => !sent.includes(file))))) {
        setCommentError("O comentário foi salvo. Reenvie os anexos pendentes para concluir."); return;
      }
    }
    setPendingCommentId(null); setComment(""); setCommentFiles([]); setShowEmojis(false);
  };
  const selectAndUploadAttachments = async (files: File[]) => {
    setAttachmentFiles(files);
    if (files.length === 0) return;
    if (await uploadAttachments(task.id, files, undefined, sent => setAttachmentFiles(current => current.filter(file => !sent.includes(file))))) {
      setAttachmentFiles([]);
      setFileInputKey((value) => value + 1);
    }
  };
  return <Overlay title={task.title} titleAccessory={<TaskProtocolChip protocol={task.protocol}/>} eyebrow="Detalhes da tarefa" onClose={onClose} wide side detail headerMeta={<>
    <TaskClientStateBadge state={task.clientNotificationState}/>
    <span className="task-header-subtitle">Última atualização em {dt(task.updatedAt)}</span>
  </>} headerActions={<>
    <button className="copy-task-link card-copy-link" onClick={async () => { const url = new URL(window.location.href); url.searchParams.set("mod", "tasks"); url.searchParams.set("task", task.id); await navigator.clipboard.writeText(url.toString()); }}><Clipboard size={14} /> Copiar link</button>
    {canRemind&&<ReminderAction context={{module:"tasks",entityId:task.id,clientId:task.customerCode,customerName:task.customerName,title:task.title,summary:task.description}} compact={false}/>}
    {(linkedDevelopment || developmentSubtaskId) ? <button className="task-dev-detail-action" type="button" onClick={() => { if(linkedDevelopment)setLinkedDrawer(true);else window.location.href = `/?mod=ti&subtask=${developmentSubtaskId}`; }}><Code2 size={15} /> Acessar subtarefa de TI</button> : canEdit && <button className="task-dev-detail-action" type="button" disabled={busy || sentToDevelopment} title="Enviar esta tarefa para a triagem de desenvolvimento" onClick={() => { void onSendToDevelopment(task).then((result) => { if (result) { setSentToDevelopment(true); setDevelopmentSubtaskId(result.id ?? ""); } }); }}><Code2 size={15} /> {sentToDevelopment ? "Enviada para Desenvolvimento" : "Enviar para Desenvolvimento"}</button>}
    {canSchedule&&<button type="button" className="task-agenda-action agenda-detail-action" onClick={()=>openAgendaComposer({module:"tasks",entityId:task.id,clientId:task.customerCode,customerName:task.customerName,title:task.title,summary:task.description})}><CalendarDays size={15}/>Agendar</button>}
  </>}>
    <div className="task-detail-layout"><main className="task-detail-main-column">    <section className="task-description-card"><div className="task-description-surface"><h3><FileText size={22} /> Descrição da tarefa</h3><p>{task.description}</p></div></section>
    <section className="task-files-panel">
      <header><h3><button type="button" className="task-attachment-trigger" disabled={!canEdit||busy} onClick={()=>attachmentInput.current?.click()} title={canEdit?"Adicionar imagens, vídeos ou documentos":"Anexos da tarefa"}><Paperclip size={21}/>Anexos</button></h3><span>{task.attachments?.length??0} {(task.attachments?.length??0)===1?"arquivo":"arquivos"}</span></header>
      <input key={fileInputKey} ref={attachmentInput} type="file" hidden multiple disabled={!canEdit||busy} onChange={event=>void selectAndUploadAttachments(Array.from(event.currentTarget.files??[]))}/>
      {task.attachments?.length?<div className={`task-attachment-grid ${task.attachments.length > 1 ? "multiple" : "single"}`}>{task.attachments.map(attachment=><TaskAttachmentPreview key={attachment.id} attachment={attachment} canDelete={canEdit} busy={busy} onDelete={deleteAttachment} onPreview={setAttachmentPreview}/>)}</div>:<p className="task-attachment-empty">Nenhum arquivo anexado.{canEdit&&" Clique em Anexos para adicionar."}</p>}
      {attachmentFiles.length>0&&<div className="task-upload-pending" role="status"><span>{attachmentFiles.length} arquivo(s) {busy?"em envio":"pendente(s)"}</span>{!busy&&<button type="button" onClick={()=>void selectAndUploadAttachments(attachmentFiles)}>Reenviar</button>}</div>}
    </section>
      <section className="task-conversation-card"><header><h3><MessageSquareText size={17} /> Comentários</h3><span>({Math.min(commentLimit,task.comments.length)} últimos)</span></header><div className="task-comments">{task.comments.length === 0 ? <p className="task-empty-message">Nenhum comentário registrado.</p> : commentsByDate.slice(-commentLimit).map((c) => <article key={c.id} className={`task-comment-entry${currentUserId===c.authorUserId?" own":""}`}><CollaboratorAvatar collaborator={module.collaborators.find((item) => item.id === c.authorUserId)} /><div><header className="task-comment-head"><b>{c.authorName}</b><time>{dt(c.createdAt)}</time>{canInteract&&currentUserId===c.authorUserId&&editingCommentId!==c.id&&<button type="button" onClick={()=>{setEditingCommentId(c.id);setEditingCommentBody(c.body)}} aria-label="Editar comentário"><Pencil size={13}/></button>}</header>{canInteract&&editingCommentId===c.id?<div data-comment-composer="true" className="task-comment-editor"><CommentInput data-comment-input="true" value={editingCommentBody} onChange={event=>setEditingCommentBody(event.target.value)} rows={3}/><span><button type="button" onClick={()=>{setEditingCommentId("");setEditingCommentBody("")}}>Cancelar</button><button type="button" className="primary-button" disabled={busy||!editingCommentBody.trim()} onClick={async()=>{const result=await operate({action:"updateTaskComment",taskId:task.id,id:c.id,body:editingCommentBody},"Comentário atualizado.");if(result){setEditingCommentId("");setEditingCommentBody("")}}}>Salvar</button></span></div>:c.body&&<p><CommentContent text={c.body}/></p>}{c.attachments?.length > 0 && <div className="comment-attachments">{c.attachments.map((file) => isImageFile(file.fileName) || isVideoFile(file.fileName) ? <button type="button" key={file.id} onClick={() => setAttachmentPreview({ url: file.url, name: file.fileName, video: isVideoFile(file.fileName) })}><Paperclip size={13} /> Visualizar {file.fileName}</button> : <a href={file.url} target="_blank" rel="noreferrer" key={file.id}><Paperclip size={13} /> {file.fileName}</a>)}</div>}</div></article>)}</div>
        {task.comments.length>commentLimit&&<button type="button" className="task-see-more" onClick={()=>setCommentLimit(value=>value+5)}><ChevronDown size={15}/>Ver mais comentários ({task.comments.length-commentLimit})</button>}
        {commentError && <p role="alert">{commentError}</p>}{canEdit && <form data-comment-composer="true" onSubmit={submitComment}><label htmlFor="task-comment" className="sr-only">Adicionar comentário</label><CommentEditor data-comment-input="true" ref={commentInput} id="task-comment" rows={2} readOnly={!!pendingCommentId} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva uma mensagem…" /><div className="task-comment-tools"><button className={showEmojis ? "active" : ""} type="button" onClick={() => setShowEmojis((value) => !value)} aria-label="Adicionar emoji" title="Adicionar emoji"><Smile size={17} /></button><label className="comment-file-picker" title="Anexar arquivos"><Paperclip size={17} /><span className="sr-only">Anexar arquivos</span><input type="file" multiple onChange={(event) => setCommentFiles((current) => mergeSelectedFiles(current, Array.from(event.target.files ?? [])))} /></label>{showEmojis && <div className="task-emoji-picker" aria-label="Emojis rápidos">{["😀", "👍", "✅", "🎯", "🚨", "🙏", "📌", "💬", "📎", "🚀"].map((emoji) => <button type="button" onClick={() => insertEmoji(emoji)} key={emoji} aria-label={`Inserir ${emoji}`}>{emoji}</button>)}</div>}</div>{commentFiles.length > 0 && <div className="comment-selected-files">{commentFiles.map((file) => <button type="button" key={`${file.name}-${file.lastModified}`} onClick={() => {if(/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime))$/.test(file.type))setAttachmentPreview({url:URL.createObjectURL(file),name:file.name,video:file.type.startsWith("video/"),temporary:true});else downloadSelectedTaskFile(file)}}><Paperclip size={13}/>{file.name}<small>Clique para visualizar</small></button>)}</div>}<footer><small>{comment.length} caracteres · {commentFiles.length} arquivo(s)</small><button data-comment-submit="true" disabled={busy || !comment.trim()}><Send size={17}/><span className="sr-only">Enviar</span></button></footer></form>}</section></main><aside className="task-detail-side-column"><section className="task-detail-summary"><header><Clipboard size={18}/><strong>Resumo</strong></header><div><FileText size={18}/><span><small>ID</small><strong>{task.customerCode||"Não vinculado"}</strong></span></div><div><Layers size={18}/><span><small>Tipo</small><strong>{task.typeName}</strong></span></div><div className={`task-summary-priority ${/alta|urgente|cr[ií]tica/i.test(task.priorityName)?"high":""}`}><Flag size={18}/><span><small>Prioridade</small><strong>{task.priorityName}</strong></span></div><div><CalendarDays size={18}/><span><small>Criação</small><strong>{dt(task.createdAt)}</strong></span></div><div><History size={18}/><span><small>Atualização</small><strong>{dt(task.updatedAt)}</strong></span></div><div className="task-summary-owner"><UserRound size={18}/><span><small>Responsável</small><strong>{task.assigneeName}</strong></span></div></section>    <section className="task-actions-panel">
      <header><div><span>AÇÕES DA TAREFA</span><h3><Zap size={22}/>Ações da tarefa</h3></div><p>Use os controles abaixo para alterar o fluxo ou solicitar uma ação.</p></header>
      <div className="task-action-fields">
        <div className="task-responsible-transfer"><label><span>{canTransferResponsible?"Transferir responsável":"Responsável"}</span>{canClaim||canTransferResponsible?<SearchablePeopleSelect searchLabel="Responsável da tarefa" disabled={busy} value={responsibleUserId} onChange={event=>setResponsibleUserId(event.target.value)}>{!task.assigneeUserId&&<option value="">Fila compartilhada</option>}{responsibleChoices.map(collaborator=><option value={collaborator.id} key={collaborator.id}>{collaborator.name}</option>)}</SearchablePeopleSelect>:<input aria-label="Responsável da tarefa" value={task.assigneeName||"Fila compartilhada"} readOnly/>}</label>{(canClaim||canTransferResponsible)&&<button type="button" aria-label={canClaim?"Assumir tarefa":"Transferir responsável"} title={canClaim?"Assumir tarefa em meu nome":"Confirmar transferência do responsável"} disabled={busy||!canClaim&&(!responsibleUserId||responsibleUserId===task.assigneeUserId)} onClick={()=>void operate({action:"assignTask",taskId:task.id,assigneeUserId:canClaim?currentUserId:responsibleUserId,version:task.version},canClaim?"Tarefa assumida.":"Responsável transferido com sucesso.")}><UsersRound size={15}/>{canClaim?"Assumir":"Transferir"}</button>}</div>
        {canRunWorkflow && <label className="status-control"><span>Status</span><select value={task.statusId} onChange={async (e) => {
          const target = module.statuses.find((s) => s.id === e.target.value);
          const justification = target?.requiresJustification ? window.prompt("Justificativa obrigatória:") : "";
          if (!target?.requiresJustification || justification) await operate({ action: "changeTaskStatus", taskId: task.id, statusId: e.target.value, justification, version: task.version }, "Status atualizado.");
        }}>{availableStatuses.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
        {canEdit && has("changePriority") && <label className="priority-control"><span>Prioridade</span><select value={task.priorityId} onChange={(e) => void operate({ action: "changeTaskPriority", taskId: task.id, priorityId: e.target.value, version: task.version }, "Prioridade atualizada.")}>{module.priorities.filter((p) => p.active).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}
        {canEdit && has("changeSla") && <label className="sla-control"><span>Política de SLA</span><select value={task.slaPolicyId ?? ""} onChange={(e) => void operate({ action: "changeTaskSla", taskId: task.id, slaPolicyId: e.target.value || null, version: task.version }, "SLA recalculado.")}><option value="">Sem SLA</option>{module.slaPolicies.filter((s) => s.active).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
      </div>
      <div className="task-action-buttons">

        <button className={`contact-action ${task.clientNotificationState==="Avisar Cliente"?"selected":""}`} type="button" disabled={busy||!canInteract} onClick={() => setClientNoticeOpen(true)}><Bell size={15} /> Avisar cliente</button>
        <button className="whatsapp-action" onClick={() => { const url=desktopWhatsappUrl(task.clientWhatsApp);if(url)window.location.href=url; }}><MessageSquareText size={15} /> Abrir no WhatsApp</button>
        <button className={`notify-action ${task.clientNotificationState==="Cliente Informado"?"selected":""}`} disabled={busy||!canInteract} onClick={() => void operate({ action: "communicateWithClient", taskId: task.id, clientAction: "clientInformed", channel: "Interno", message: `Cliente informado sobre a tarefa ${task.protocol}.` }, "Cliente marcado como informado.")}><CheckCircle2 size={15} /> Cliente informado</button>
        <button className={`no-need-action ${task.clientNotificationState==="Sem Necessidade"?"selected":""}`} disabled={busy||!canInteract} onClick={() => void operate({ action: "communicateWithClient", taskId: task.id, clientAction: "noNeed", channel: "Interno", message: "Sem necessidade de comunicação com o cliente." }, "Tarefa marcada sem necessidade de aviso.")}><Check size={15} /> Sem necessidade</button>
        {canRunWorkflow && approvalStatus && !task.completedAt && task.statusId !== approvalStatus.id && <button className="task-complete-button" type="button" disabled={busy} onClick={() => void operate({ action: "changeTaskStatus", taskId: task.id, statusId: approvalStatus.id, justification: "Encaminhada para aprovação.", version: task.version }, "Tarefa enviada para aprovação.")}><CheckCircle2 size={17} /> Enviar para aprovação</button>}
        {canRunWorkflow && finalStatus && !task.completedAt && <button className="task-complete-button" type="button" disabled={busy} onClick={() => void operate({ action: "changeTaskStatus", taskId: task.id, statusId: finalStatus.id, justification: "Tarefa concluída pelo responsável.", version: task.version }, "Tarefa concluída com sucesso.")}><CheckCircle2 size={17}/> Concluir tarefa</button>}
      </div>
    <div className="task-aux-controls">{canEdit && has("changeStatus") && finalStatus && <div className="task-quick-workflow">
        {canEdit && has("changeStatus") && approvalStatus && finalStatus && task.statusId === approvalStatus.id && canApprove && <button className="task-complete-button" type="button" disabled={busy} onClick={() => void operate({ action: "changeTaskStatus", taskId: task.id, statusId: finalStatus.id, justification: "Aprovada pela coordenação.", version: task.version }, "Tarefa aprovada e concluída com sucesso.")}><CheckCircle2 size={17} /> Aprovar e concluir</button>}
        {canEdit && has("changeStatus") && task.completedAt && resumeStatus && <button className="task-resume-control" type="button" disabled={busy} onClick={() => void operate({ action: "changeTaskStatus", taskId: task.id, statusId: resumeStatus.id, justification: "Tarefa retomada.", version: task.version }, "Tarefa retomada com sucesso.")}><RotateCcw size={16} /> Retomar tarefa</button>}
      </div>}</div></section>      <section className="task-history-card"><header><h3><History size={17} /> Histórico</h3><span>({Math.min(historyLimit,task.history.length)} últimos)</span></header><div className="task-history">{historyByDate.slice(0,historyLimit).map((h) => <article key={h.id}><i /><div><b>{h.summary}</b><small>{h.actorName} · {dt(h.createdAt)}</small>{h.justification && <p>Justificativa: {h.justification}</p>}</div></article>)}</div>{task.history.length>historyLimit&&<button type="button" className="task-see-more" onClick={()=>setHistoryLimit(value=>value+5)}><ChevronDown size={15}/>Ver mais histórico ({task.history.length-historyLimit})</button>}</section><div className="task-detail-footer">{canForwardTask && module.departments.some((department) => department.active && department.id !== task.currentDepartmentId) && <details className="task-transfer-disclosure"><summary><ChevronDown size={15}/>Encaminhar para outro setor</summary><div className="task-transfer"><div><span>TRANSFERÊNCIA DE SETOR</span><h3>Encaminhar tarefa</h3><p>Ela sairá do quadro de <b>{task.departmentName}</b> e entrará na etapa inicial do setor de destino.</p></div><label>Setor de destino<select value={transferDepartment} onChange={(e) => { setTransferDepartment(e.target.value); }}><option value="">Selecionar setor</option>{module.departments.filter((d) => d.active && d.id !== task.currentDepartmentId).map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select></label><label>Novo responsável<SearchablePeopleSelect searchLabel="Novo responsável" disabled={!!task.assigneeUserId&&!isAssignee} value={transferAssignee} onChange={(e) => setTransferAssignee(e.target.value)}><option value="">Fila compartilhada</option>{availableAssignees.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</SearchablePeopleSelect></label><label className="task-transfer-reason">Motivo<input value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Explique o encaminhamento" /></label><button disabled={busy || !transferDepartment || !transferReason.trim()} onClick={async () => { const result = await operate({ action: "transferTask", taskId: task.id, departmentId: transferDepartment, assigneeUserId: transferAssignee || null, reason: transferReason.trim(), recalculateSla: true, version: task.version }, "Tarefa encaminhada para o novo setor."); if (result) onClose(); }}>Encaminhar tarefa</button></div></details>}    {canEdit && task.canModify && <section className="task-owner-controls"><button onClick={() => setEditing(true)}><Pencil size={15} /> Editar tarefa</button><button className="delete" onClick={async () => { const result = await operate({ action: "deleteTask", taskId: task.id, version: task.version }, "Tarefa excluída com sucesso."); if (result) onClose(); }}><Trash2 size={15} /> Excluir tarefa</button></section>}</div></aside></div>
    {clientNoticeOpen && <TaskClientNoticeModal task={task} message={clientNoticeMessage} onMessageChange={setClientNoticeMessage} busy={busy} onClose={() => setClientNoticeOpen(false)} onSend={async () => { const result = await operate({ action: "communicateWithClient", taskId: task.id, clientAction: "requestContact", channel: "Interno", message: clientNoticeMessage.trim() }, "Criador, responsável e coordenadores dos setores foram avisados para contatar o cliente."); if (result) setClientNoticeOpen(false); return Boolean(result); }} />}
    {editing && <TaskEditPortal><EditTaskModal task={task} module={module} customers={customers} busy={busy} onClose={() => setEditing(false)} onSubmit={async (payload) => { const result = await operate({ action: "updateTask", requireConfirmation: true, taskId: task.id, ...payload }, "Tarefa atualizada com sucesso."); if (result) setEditing(false); }} /></TaskEditPortal>}
    {linkedDrawer && linkedDevelopment && <LinkedDevelopmentDrawer item={linkedDevelopment} taskModule={module} user={user} onClose={()=>setLinkedDrawer(false)}/>}
    {attachmentPreview && <div className="task-media-preview-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) { if (attachmentPreview.temporary) URL.revokeObjectURL(attachmentPreview.url); setAttachmentPreview(null); } }}><section className="task-media-preview" role="dialog" aria-modal="true" aria-label={`Visualizar ${attachmentPreview.name}`}><header><strong>{attachmentPreview.name}</strong><button type="button" aria-label="Fechar" onClick={() => { if (attachmentPreview.temporary) URL.revokeObjectURL(attachmentPreview.url); setAttachmentPreview(null); }}><X size={19}/></button></header>{attachmentPreview.video ? <video controls autoPlay><source src={attachmentPreview.url}/></video> : <img src={attachmentPreview.url} alt={attachmentPreview.name}/>}<a href={attachmentPreview.url} target="_blank" rel="noreferrer">Abrir arquivo em nova guia</a></section></div>}
  </Overlay>;
}

function downloadSelectedTaskFile(file:File){const url=URL.createObjectURL(new Blob([file],{type:"application/octet-stream"}));const link=document.createElement("a");link.href=url;link.download=file.name;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),60_000);}
const isImageFile = (fileName: string) => /\.(avif|gif|jpe?g|png|webp)$/i.test(fileName);
const isVideoFile = (fileName: string) => /\.(mp4|mov|m4v|webm|ogg)$/i.test(fileName);

function TaskAttachmentPreview({ attachment, canDelete, busy, onDelete, onPreview }: { attachment: CorporateTask["attachments"][number]; canDelete: boolean; busy: boolean; onDelete: (attachmentId: string) => Promise<boolean>; onPreview: (preview: { url: string; name: string; video: boolean }) => void }) {
  const media = isImageFile(attachment.fileName) || isVideoFile(attachment.fileName);
  const Icon=/\.(xlsx?|csv)$/i.test(attachment.fileName)?FileSpreadsheet:FileText;
  return <article className="task-attachment-link">
    {media ? <button type="button" onClick={() => onPreview({ url: attachment.url, name: attachment.fileName, video: isVideoFile(attachment.fileName) })}><Icon size={18} className={Icon===FileSpreadsheet?"spreadsheet":""}/><span><b>{attachment.fileName}</b><small>{((attachment.sizeBytes??0)/1024/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})} MB</small></span></button> : <a href={attachment.url} target="_blank" rel="noreferrer"><Icon size={18} className={Icon===FileSpreadsheet?"spreadsheet":""}/><span><b>{attachment.fileName}</b><small>{((attachment.sizeBytes??0)/1024/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})} MB</small></span></a>}
    {canDelete && <button className="delete" type="button" disabled={busy} onClick={() => void onDelete(attachment.id)} aria-label={`Excluir ${attachment.fileName}`}><Trash2 size={14} /></button>}
  </article>;
}

export function CatalogsModule({ module, section, onSection, canManage, busy, operate }: { module: TaskModuleData; section: CatalogSection; onSection: (section: CatalogSection) => void; canManage: boolean; busy: boolean; operate: Props["operate"] }) {
  const pages: Record<CatalogSection, { title: string; description: string }> = {
    departments: { title: "Setores", description: "Organize as áreas da empresa, coordenadores e regras de encaminhamento." },
    types: { title: "Tipos de tarefa", description: "Configure os tipos disponíveis, setores responsáveis, fluxo, prioridade e SLA padrão." },
    priorities: { title: "Prioridades", description: "Defina a criticidade, identificação visual e prazo padrão das demandas." },
    statuses: { title: "Etapas do Kanban", description: "Configure as etapas, a ordem e as regras de movimentação das tarefas em um único cadastro." },
    kanban: { title: "Etapas do Kanban", description: "Configure as etapas, a ordem e as regras de movimentação das tarefas em um único cadastro." },
    sla: { title: "Políticas de SLA", description: "Defina somente o prazo em dias úteis; a contagem começa quando a tarefa é criada." },
    people: { title: "Colaboradores", description: "Gerencie cargo, contato, situação, setores e responsabilidades de coordenação." },
  };
  const page = pages[section];
  return <div className="catalogs-module">
    <header className="catalog-page-heading module-page-header">
      <div className="module-page-title"><span className="module-page-title-icon"><Settings size={21} /></span><span className="module-page-copy"><span className="eyebrow">CADASTROS DO SISTEMA</span><h1>{page.title}</h1><p>{page.description}</p></span></div>
      <span className="catalog-page-context module-page-actions">Cadastros <ChevronRight size={13} /> {page.title}</span>
    </header>
    <nav className="task-catalog-tabs" aria-label="Cadastros de tarefas">{([['types','Tipo'],['priorities','Prioridade'],['sla','SLA'],['statuses','Etapas do Kanban']] as Array<[CatalogSection,string]>).map(([key,label]) => <button className={(section === "kanban" ? "statuses" : section) === key ? "active" : ""} onClick={() => onSection(key)} key={key}>{label}</button>)}</nav>
    {!canManage && <div className="readonly-note">Seu grupo possui acesso de consulta. Para alterar cadastros, habilite “Administrar” na tela Cadastros.</div>}
    <TaskSettings key={section === "kanban" ? "statuses" : section} module={module} tab={section === "kanban" ? "statuses" : section} onTab={onSection} canManage={canManage} busy={busy} operate={operate} />
  </div>;
}

function TaskSettings({ module, tab, onTab, canManage, busy, operate }: { module: TaskModuleData; tab: CatalogSection; onTab: (section: CatalogSection) => void; canManage: boolean; busy: boolean; operate: Props["operate"] }) {
  const [editingId, setEditingId] = useState<string | null | undefined>(null);
  const submit = (action: string, success: string) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const payload: Record<string, unknown> = Object.fromEntries(f);
    payload.id = editingId;
    payload.active = f.has("active");
    if (action === "saveTaskDepartment") {
      payload.requiresAssigneeOnTransfer = f.has("requiresAssigneeOnTransfer");
      payload.coordinatorUserIds = f.getAll("coordinatorUserIds");
      payload.approverUserId = f.get("approverUserId") || null;
    }
    if (action === "saveTaskPriority") {
      payload.severityOrder = Number(f.get("severityOrder"));
      payload.defaultDueMinutes = f.get("defaultDueMinutes") ? Number(f.get("defaultDueMinutes")) : null;
    }
    if (action === "saveTaskStatus") {
      payload.name = String(f.get("name") || "").trim();
      payload.kanbanColumn = payload.name;
      payload.departmentId = f.get("departmentId") || null;
      payload.displayOrder = Number(f.get("displayOrder"));
      payload.isInitial = f.has("isInitial");
      payload.isFinal = f.has("isFinal");
      payload.requiresJustification = f.has("requiresJustification");
      payload.acceptsNewTasks = f.has("acceptsNewTasks");
      payload.manualMovement = f.has("manualMovement");
    }
    if (await operate({ action, ...payload }, success)) { form.reset(); setEditingId(null); }
  };
  const department = module.departments.find((item) => item.id === editingId);
  const priority = module.priorities.find((item) => item.id === editingId);
  const status = module.statuses.find((item) => item.id === editingId);
  const removeCatalog = async (catalog: string, id: string, label: string) => {
    await operate({ action: "deleteTaskCatalog", catalog, id }, `${label} desativado com histórico preservado.`);
    setEditingId(null);
  };
  const toggleCatalog = async (catalog: string, id: string, label: string) => {
    if (catalog === "departments") { const item = module.departments.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskDepartment", id, name: item.name, catalogDescription: item.description, requiresAssigneeOnTransfer: item.requiresAssigneeOnTransfer, approverUserId: item.approverUserId || null, coordinatorUserIds: item.coordinatorUserIds, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
    if (catalog === "priorities") { const item = module.priorities.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskPriority", id, name: item.name, severityOrder: item.severityOrder, color: item.color, defaultDueMinutes: item.defaultDueMinutes, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
    if (catalog === "statuses") { const item = module.statuses.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskStatus", id, name: item.name, departmentId: item.departmentId, displayOrder: item.displayOrder, kanbanColumn: item.kanbanColumn, isInitial: item.isInitial, isFinal: item.isFinal, acceptsNewTasks: item.acceptsNewTasks, manualMovement: item.manualMovement, requiresJustification: item.requiresJustification, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
    if (catalog === "types") { const item = module.types.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskType", id, name: item.name, catalogDescription: item.description, defaultPriorityId: item.defaultPriorityId, defaultSlaPolicyId: item.defaultSlaPolicyId, initialStatusId: item.initialStatusId, departmentIds: item.departmentIds, allowedStatusIds: item.allowedStatusIds, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
    if (catalog === "sla") { const item = module.slaPolicies.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskSla", id, name: item.name, departmentId: item.departmentId, typeId: item.taskTypeId, priorityId: item.priorityId, firstResponseMinutes: item.firstResponseMinutes, serviceStartMinutes: item.serviceStartMinutes, completionMinutes: item.completionMinutes, businessDays: item.businessDays, businessStart: item.businessStart, businessEnd: item.businessEnd, alertBeforeMinutes: item.alertBeforeMinutes, escalationMinutes: item.escalationMinutes, pauseStatusIds: item.pauseStatusIds, recalculateSla: item.recalculateOnTransfer, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
  };
  return <TaskCatalogActions.Provider value={{ remove: removeCatalog, toggle: toggleCatalog }}><div className={`task-settings ${canManage ? "" : "readonly"}`}><section>
        {tab === "sla" && <SimpleSlaEditor module={module} editingId={editingId} setEditingId={setEditingId} busy={busy} operate={operate} />}
        {tab === "departments" && <Catalog title="Setores" editingId={editingId} onEdit={setEditingId} items={module.departments.map((d) => ({ id: d.id, title: d.name, subtitle: d.description, active: d.active }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskDepartment", "Setor salvo.")}><input name="name" required placeholder="Nome do setor" defaultValue={department?.name} /><input name="catalogDescription" placeholder="Descrição" defaultValue={department?.description} /><label><input type="checkbox" name="requiresAssigneeOnTransfer" defaultChecked={department?.requiresAssigneeOnTransfer} /> Exigir responsável</label><DepartmentApproverFields people={module.collaborators.filter(c => c.active).map(c => ({ id: c.id, label: c.name }))} coordinatorUserIds={department?.coordinatorUserIds ?? []} approverUserId={department?.approverUserId} disabled={busy} /><ActiveField value={department?.active} /><FormButtons editing={!!department} busy={busy} onCancel={() => setEditingId(null)} label="setor" /></form></Catalog>}
    {tab === "priorities" && <Catalog title="Prioridades" editingId={editingId} onEdit={setEditingId} items={module.priorities.map((p) => ({ id: p.id, title: p.name, subtitle: `Ordem ${p.severityOrder} · prazo ${p.defaultDueMinutes ?? "—"} min`, active: p.active, color: p.color }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskPriority", "Prioridade salva.")}><input name="name" required placeholder="Nome" defaultValue={priority?.name} /><input name="severityOrder" required type="number" placeholder="Ordem" min="0" defaultValue={priority?.severityOrder ?? Math.max(0, ...module.priorities.map(p => p.severityOrder)) + 1} /><input name="color" type="color" defaultValue={priority?.color ?? "#2563eb"} /><input name="defaultDueMinutes" type="number" placeholder="Prazo padrão (min)" defaultValue={priority?.defaultDueMinutes ?? ""} /><ActiveField value={priority?.active} /><FormButtons editing={!!priority} busy={busy} onCancel={() => setEditingId(null)} label="prioridade" /></form></Catalog>}
    {tab === "statuses" && <Catalog title="Etapas do Kanban" editingId={editingId} onEdit={setEditingId} items={module.statuses.map((s) => ({ id: s.id, title: s.name, subtitle: `${module.departments.find((department) => department.id === s.departmentId)?.name ?? "Todos os setores"} · posição ${s.displayOrder}${s.isInitial ? " · inicial" : ""}${s.isFinal ? " · final" : ""}`, active: s.active }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskStatus", "Etapa do Kanban salva.")}>
      <label className="catalog-field"><span>Nome da etapa *</span><input name="name" required maxLength={120} placeholder="Ex.: Em análise" defaultValue={status?.name} autoFocus /></label>
      <label className="catalog-field"><span>Setor</span><select name="departmentId" defaultValue={status?.departmentId ?? ""}><option value="">Todos os setores</option>{module.departments.filter((department) => department.active || department.id === status?.departmentId).map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select></label>
      <label className="catalog-field"><span>Posição no Kanban</span><input name="displayOrder" type="number" min="0" required defaultValue={status?.displayOrder ?? Math.max(0, ...module.statuses.map(s => s.displayOrder)) + 1} /></label>
      <label><input name="isInitial" type="checkbox" defaultChecked={status?.isInitial} /> Primeira etapa</label><label><input name="isFinal" type="checkbox" defaultChecked={status?.isFinal} /> Etapa final</label><label><input name="acceptsNewTasks" type="checkbox" defaultChecked={status?.acceptsNewTasks ?? true} /> Recebe novas tarefas</label><label><input name="manualMovement" type="checkbox" defaultChecked={status?.manualMovement ?? true} /> Permite movimentação</label><label><input name="requiresJustification" type="checkbox" defaultChecked={status?.requiresJustification} /> Exige justificativa</label><ActiveField value={status?.active} /><FormButtons editing={!!status} busy={busy} onCancel={() => setEditingId(null)} label="etapa" /></form></Catalog>}
        {tab === "types" && <TaskTypeEditor module={module} editingId={editingId} setEditingId={setEditingId} busy={busy} operate={operate} />}
    {tab === "people" && <div className="catalog-page-content">
      <div className="catalog-form collaborator-create-card">
        <div className="catalog-card-heading"><span>NOVO COLABORADOR</span><h2>Cadastrar colaborador</h2><p>Inclua os dados de contato e defina em quais setores o colaborador poderá receber tarefas.</p></div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const saved = await operate({
            action: "createTaskCollaborator",
            displayName: f.get("displayName"),
            email: f.get("email"),
            phone: f.get("phone"),
            jobTitle: f.get("jobTitle"),
            departmentIds: f.getAll("departmentIds"),
            coordinatorDepartmentIds: f.getAll("coordinatorDepartmentIds"),
            active: f.has("active"),
          }, "Colaborador cadastrado.");
          if (saved) form.reset();
        }}>
          <label className="catalog-field"><span>Nome completo *</span><input name="displayName" required minLength={2} placeholder="Ex.: Maria Oliveira" autoComplete="name" /></label>
          <label className="catalog-field"><span>E-mail *</span><input name="email" required type="email" placeholder="maria@dontus.com.br" autoComplete="email" /></label>
          <label className="catalog-field"><span>Telefone</span><PhoneInput name="phone" type="tel" placeholder="(00) 00000-0000" autoComplete="tel" /></label>
          <label className="catalog-field"><span>Cargo</span><input name="jobTitle" placeholder="Ex.: Analista de suporte" autoComplete="organization-title" /></label>
          <CheckGroup legend="Setores" name="departmentIds" values={module.departments.filter((d) => d.active).map((d) => ({ id: d.id, label: d.name }))} selected={[]} />
          <CheckGroup legend="Coordena (selecione também em Setores)" name="coordinatorDepartmentIds" values={module.departments.filter((d) => d.active).map((d) => ({ id: d.id, label: d.name }))} selected={[]} />
          <ActiveField />
          <span className="catalog-form-actions"><button disabled={busy} type="submit"><UserRound size={15} /> Cadastrar colaborador</button></span>
        </form>
      </div>
      <div className="catalog-records-heading"><div><h2>Colaboradores cadastrados</h2><p>Usuários inativos permanecem no histórico, mas não recebem novas tarefas.</p></div><b>{module.collaborators.length} registro(s)</b></div>
      <div className="collaborator-list">{module.collaborators.map((c) => <form key={c.id} onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await operate({ action: "saveTaskCollaborator", userId: c.id, phone: f.get("phone"), jobTitle: f.get("jobTitle"), departmentIds: f.getAll("departmentIds"), coordinatorDepartmentIds: f.getAll("coordinatorDepartmentIds"), active: f.has("active") }, "Colaborador atualizado."); }}><div className="collaborator-identity"><CollaboratorAvatar collaborator={c} /><span><b>{c.name}</b><small>{c.email}</small></span></div><PhoneInput name="phone" defaultValue={c.phone} placeholder="Telefone" aria-label={`Telefone de ${c.name}`} /><input name="jobTitle" defaultValue={c.jobTitle} placeholder="Cargo" aria-label={`Cargo de ${c.name}`} /><CheckGroup legend="Setores" name="departmentIds" values={module.departments.map((d) => ({ id: d.id, label: d.name }))} selected={c.departmentIds} /><CheckGroup legend="Coordena" name="coordinatorDepartmentIds" values={module.departments.map((d) => ({ id: d.id, label: d.name }))} selected={c.coordinatorDepartmentIds} /><ActiveField value={c.active} /><button disabled={busy}>Salvar alterações</button></form>)}</div>
    </div>}
  </section></div></TaskCatalogActions.Provider>;
}

function LegacyCatalog({ title, items, editingId, onEdit, children }: { title: string; items: Array<{ id: string; title: string; subtitle: string; active: boolean; color?: string }>; editingId: string | null; onEdit: (id: string) => void; children: React.ReactNode }) {
  const actions = useContext(TaskCatalogActions);
  const catalog = ({ "Setores": "departments", "Prioridades": "priorities", "Status": "statuses", "Kanban": "statuses", "Tipos de tarefa": "types", "Políticas de SLA": "sla" } as Record<string, string>)[title];
  return <div className="catalog-page-content" aria-label={title}><div className="catalog-form"><div className="catalog-card-heading"><span>{editingId ? "EDITANDO REGISTRO" : "NOVO REGISTRO"}</span><h2>{editingId ? `Editar ${title.toLocaleLowerCase("pt-BR")}` : `Cadastrar ${title.toLocaleLowerCase("pt-BR")}`}</h2><p>Cadastros inativos deixam de aparecer imediatamente nas seleções operacionais.</p></div>{children}</div><div className="catalog-records-heading"><div><h2>{title} cadastrados</h2><p>Itens inativos permanecem aqui para edição, reativação ou exclusão definitiva.</p></div><b>{items.filter((item) => item.active).length} ativo(s) de {items.length}</b></div><div className="catalog-list">{items.map((item) => <article className={editingId === item.id ? "selected" : ""} key={item.id}><i style={{ background: item.color ?? (item.active ? "#22c55e" : "#94a3b8") }} /><span><b>{item.title}</b><small>{item.subtitle || "Sem descrição"}</small></span><em className={item.active ? "active" : "inactive"}>{item.active ? "Ativo" : "Inativo"}</em><button type="button" onClick={() => onEdit(item.id)}>Editar</button>{actions && catalog && <button type="button" className="catalog-delete-action" onClick={() => void actions.remove(catalog, item.id, item.title)}><Trash2 size={14} /> Desativar</button>}</article>)}</div></div>;
}

function Catalog({ title, items, editingId, onEdit, children }: { title: string; items: Array<{ id: string; title: string; subtitle: string; active: boolean; color?: string }>; editingId: string | null | undefined; onEdit: (id: string | null | undefined) => void; children: React.ReactNode }) {
  const actions = useContext(TaskCatalogActions);
  const catalog = title === "Setores" ? "departments" : title === "Prioridades" ? "priorities" : ["Status", "Kanban", "Etapas do Kanban"].includes(title) ? "statuses" : title === "Tipos de tarefa" ? "types" : title === "Políticas de SLA" ? "sla" : "";
  const [showInactive, setShowInactive] = useState(false);
  const visibleItems = items.filter((item) => item.active || showInactive);
  const singular = ({ "Setores": "setor", "Prioridades": "prioridade", "Etapas do Kanban": "etapa do Kanban", "Tipos de tarefa": "tipo de tarefa", "Políticas de SLA": "política de SLA" } as Record<string, string>)[title] ?? title;
  const editorTitle = `${editingId ? "Editar" : ["setor", "tipo de tarefa"].includes(singular) ? "Novo" : "Nova"} ${singular}`;
  const editorOpen = editingId !== null;
  return <div className="catalog-page-content catalog-list-page" aria-label={title}>
    <div className="catalog-records-heading">
      <div><h2>{title}</h2><p>Itens inativos permanecem disponíveis para edição e reativação. O histórico é preservado.</p></div>
      <span><b>{items.filter((item) => item.active).length} ativo(s) de {items.length}</b><label className="catalog-show-inactive"><input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} /> Mostrar inativos</label><button className="primary-button" type="button" onClick={() => onEdit(undefined)}><Plus size={16} /> Novo cadastro</button></span>
    </div>
    <div className="catalog-list">
      {visibleItems.length === 0 && <p className="catalog-empty">Nenhum cadastro ativo encontrado. Marque “Mostrar inativos” para consultar e reativar registros.</p>}
      {visibleItems.map((item) => <article className={editingId === item.id ? "selected" : ""} key={item.id}>
        <i style={{ background: item.color ?? (item.active ? "#22c55e" : "#94a3b8") }} />
        <span><b>{item.title}</b><small>{item.subtitle || "Sem descrição"}</small></span>
        <em className={item.active ? "active" : "inactive"}>{item.active ? "Ativo" : "Inativo"}</em>
        {actions && catalog && <button type="button" className={`catalog-icon-button ${item.active ? "lock" : "unlock"}`} onClick={() => void actions.toggle(catalog, item.id, item.title)} aria-label={item.active ? `Bloquear ${item.title}` : `Reativar ${item.title}`} title={item.active ? "Bloquear temporariamente" : "Reativar cadastro"}><Power size={14} /></button>}
        <button type="button" onClick={() => onEdit(item.id)}>Editar</button>
      </article>)}
    </div>
    {editorOpen && <div className="modal-backdrop catalog-editor-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onEdit(null)}>
      <div className="modal task-catalog-modal" role="dialog" aria-modal="true" aria-label={editorTitle}>
        <div className="modal-head"><div><span className="eyebrow">CADASTROS · TAREFAS</span><h2>{editorTitle}</h2><p>As alterações ficam disponíveis imediatamente nas seleções do sistema.</p></div><button className="icon-button" type="button" onClick={() => onEdit(null)} aria-label="Fechar"><X size={20} /></button></div>
        <div className="catalog-form">{children}</div>
      </div>
    </div>}
  </div>;
}

function TaskTypeEditor({ module, editingId, setEditingId, busy, operate }: { module: TaskModuleData; editingId: string | null | undefined; setEditingId: (id: string | null | undefined) => void; busy: boolean; operate: Props["operate"] }) {
  const type = module.types.find(entry => entry.id === editingId);
  return <Catalog title="Tipos de tarefa" editingId={editingId} onEdit={setEditingId} items={module.types.map(entry => ({ id: entry.id, title: entry.name, subtitle: entry.description, active: entry.active }))}>
    <TaskTypeForm key={editingId ?? "new"} module={module} type={type} busy={busy} onCancel={() => setEditingId(null)} onSave={async payload => {
      if (await operate({ action: "saveTaskType", id: editingId, ...payload }, "Tipo de tarefa e etapas salvos.")) setEditingId(null);
    }} />
  </Catalog>;
}

function TaskTypeForm({ module, type, busy, onCancel, onSave }: { module: TaskModuleData; type?: TaskType; busy: boolean; onCancel: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [departmentIds, setDepartmentIds] = useState(type?.departmentIds ?? []);
  const [requestedInitial, setRequestedInitial] = useState(type?.initialStatusId ?? "");
  const [selectedStatuses, setSelectedStatuses] = useState(type?.allowedStatusIds ?? []);
  const [error, setError] = useState("");
  const departments = module.departments.filter(entry => entry.active);
  const selectedDepartments = departmentIds.filter(id => departments.some(entry => entry.id === id));
  const statuses = module.statuses.filter(entry => entry.active && (!entry.departmentId || selectedDepartments.includes(entry.departmentId)));
  const initialOptions = initialTaskStatuses(statuses, selectedDepartments);
  const initialId = taskInitialSelection(initialOptions, requestedInitial);
  const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
  return <form className="catalog-complex-form task-type-form" onSubmit={async event => {
    event.preventDefault();
    if (!selectedDepartments.length || !initialId) { setError("Selecione ao menos um setor e uma etapa inicial ativa que receba novas tarefas."); return; }
    const form = new FormData(event.currentTarget); setError("");
    await onSave({ name: form.get("name"), catalogDescription: form.get("catalogDescription"),
      defaultPriorityId: form.get("defaultPriorityId") || null, defaultSlaPolicyId: form.get("defaultSlaPolicyId") || null,
      departmentIds: selectedDepartments, initialStatusId: initialId,
      allowedStatusIds: [...new Set([...selectedStatuses.filter(id => statuses.some(entry => entry.id === id)), initialId])], active: form.has("active") });
  }}>
    <label className="catalog-field wide"><span>Nome do tipo *</span><input name="name" required defaultValue={type?.name} autoFocus /></label>
    <label className="catalog-field wide"><span>Descrição</span><input name="catalogDescription" defaultValue={type?.description} /></label>
    <label className="catalog-field"><span>Prioridade padrão</span><select name="defaultPriorityId" defaultValue={type?.defaultPriorityId ?? ""}><option value="">Sem prioridade padrão</option>{module.priorities.filter(entry => entry.active).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label className="catalog-field"><span>SLA padrão</span><select name="defaultSlaPolicyId" defaultValue={type?.defaultSlaPolicyId ?? ""}><option value="">Sem SLA padrão</option>{module.slaPolicies.filter(entry => entry.active).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <fieldset className="catalog-check-group wide"><legend>Setores disponíveis *</legend>{departments.map(entry => <label key={entry.id}><input type="checkbox" checked={selectedDepartments.includes(entry.id)} onChange={() => setDepartmentIds(current => toggle(current, entry.id))} /> {entry.name}</label>)}{!departments.length && <p>Cadastre um setor ativo em Colaboradores → Setores.</p>}</fieldset>
    <label className="catalog-field wide"><span>Etapa inicial *</span><select name="initialStatusId" required value={initialId} onChange={event => { setRequestedInitial(event.target.value); setSelectedStatuses(current => [...new Set([...current, event.target.value])]); }}><option value="">Selecione a etapa inicial</option>{initialOptions.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><small>{initialOptions.length ? "A etapa inicial é incluída automaticamente nas etapas permitidas." : "Cadastre uma etapa ativa, não final, com Recebe novas tarefas habilitado."}</small></label>
    <fieldset className="catalog-check-group wide"><legend>Etapas permitidas</legend>{statuses.map(entry => <label key={entry.id}><input type="checkbox" checked={entry.id === initialId || selectedStatuses.includes(entry.id)} disabled={entry.id === initialId} onChange={() => setSelectedStatuses(current => toggle(current, entry.id))} /> {entry.name}</label>)}</fieldset>
    <ActiveField value={type?.active} />
    {error && <p className="wide" role="alert">{error}</p>}
    <FormButtons editing={Boolean(type)} busy={busy || !selectedDepartments.length || !initialId} onCancel={onCancel} label="tipo de tarefa" />
  </form>;
}

function SimpleSlaEditor({ module, editingId, setEditingId, busy, operate }: { module: TaskModuleData; editingId: string | null | undefined; setEditingId: (id: string | null | undefined) => void; busy: boolean; operate: Props["operate"] }) {
  const sla = module.slaPolicies.find((item) => item.id === editingId);
  const defaultDepartmentId = sla?.departmentId ?? module.departments.find((department) => department.active)?.id ?? "";
  const initialDays = Math.max(1, Math.ceil((sla?.completionMinutes ?? 480) / 480));
  return <Catalog title="Políticas de SLA" editingId={editingId} onEdit={setEditingId} items={module.slaPolicies.map((item) => ({
    id: item.id,
    title: item.name,
    subtitle: `${Math.max(1, Math.ceil(item.completionMinutes / 480))} dia(s) útil(eis)`,
    active: item.active,
  }))}>
    <form key={editingId ?? "new"} className="catalog-complex-form task-sla-form" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const businessDays = Number(form.get("businessDays"));
      if (!Number.isInteger(businessDays) || businessDays < 1) return;
      const saved = await operate({
        action: "saveTaskSla",
        id: editingId,
        name: businessDays === 1 ? "1 dia útil" : `${businessDays} dias úteis`,
        departmentId: defaultDepartmentId,
        typeId: sla?.taskTypeId ?? null,
        priorityId: sla?.priorityId ?? null,
        firstResponseMinutes: sla?.firstResponseMinutes ?? 0,
        serviceStartMinutes: sla?.serviceStartMinutes ?? 0,
        completionMinutes: businessDays * 480,
        businessDays: sla?.businessDays ?? [1, 2, 3, 4, 5],
        businessStart: sla?.businessStart ?? "08:00",
        businessEnd: sla?.businessEnd ?? "18:00",
        alertBeforeMinutes: sla?.alertBeforeMinutes ?? 0,
        escalationMinutes: sla?.escalationMinutes ?? 0,
        pauseStatusIds: sla?.pauseStatusIds ?? [],
        recalculateSla: sla?.recalculateOnTransfer ?? true,
        active: sla?.active ?? true,
      }, "Prazo de SLA salvo.");
      if (saved) setEditingId(null);
    }}>
      <label className="catalog-field wide" htmlFor="task-sla-days"><span>Prazo para conclusão (dias úteis) *</span>
        <input id="task-sla-days" name="businessDays" type="number" min="1" step="1" required defaultValue={initialDays} autoFocus />
        <small>A contagem começa no momento da criação da tarefa e considera apenas dias úteis.</small>
      </label>
      {!defaultDepartmentId && <p role="alert">Cadastre ou reative um setor para configurar o SLA.</p>}
      <FormButtons editing={!!sla} busy={busy || !defaultDepartmentId} onCancel={() => setEditingId(null)} label="prazo" />
    </form>
  </Catalog>;
}

function ActiveField({ value }: { value?: boolean }) {
  return <label><input name="active" type="checkbox" defaultChecked={value ?? true} /> Ativo</label>;
}

function FormButtons({ editing, busy, onCancel, label }: { editing: boolean; busy: boolean; onCancel: () => void; label: string }) {
  return <span className="catalog-form-actions">{editing && <button type="button" className="secondary-action" onClick={onCancel}>Cancelar edição</button>}<button disabled={busy}>{editing ? "Salvar alterações" : `Adicionar ${label}`}</button></span>;
}

function CheckGroup({ legend, name, values, selected }: { legend: string; name: string; values: Array<{ id: string; label: string }>; selected: string[] }) {
  return <fieldset className="catalog-check-group"><legend>{legend}</legend>{values.map((value) => <label key={value.id}><input type="checkbox" name={name} value={value.id} defaultChecked={selected.includes(value.id)} /> {value.label}</label>)}</fieldset>;
}

function TaskCreatedModal({ protocol, onClose }: { protocol: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return <div className="task-overlay task-created-backdrop"><div className="task-modal task-created-modal"><div className="task-modal-body"><span className="task-created-icon"><CheckCircle2 size={34} /></span><h2>Tarefa criada com sucesso</h2><p>O protocolo <strong>{protocol}</strong> já está disponível para acompanhamento.</p><div className="task-created-actions"><button className="secondary-button" onClick={async () => { await navigator.clipboard.writeText(protocol); setCopied(true); }}><Clipboard size={16} /> {copied ? "Protocolo copiado" : "Copiar protocolo"}</button><button className="primary-button" onClick={onClose}>Fechar</button></div></div></div></div>;
}

function Overlay({ title, titleAccessory, eyebrow = "TAREFAS", subtitle, onClose, wide, side = false, detail = false, headerMeta, headerActions, children }: { title: string; titleAccessory?:React.ReactNode; eyebrow?: string; subtitle?: string; onClose: () => void; wide?: boolean; side?: boolean; detail?: boolean; headerMeta?: React.ReactNode; headerActions?: React.ReactNode; children: React.ReactNode }) {
  return <div className={`task-overlay ${side ? "task-side-overlay" : ""} ${detail ? "task-detail-overlay task-reference-overlay" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className={`task-modal ${wide ? "wide" : ""} ${side ? "task-side-panel" : ""}`} role="dialog" aria-modal="true" aria-label={title} data-reminder-enhanced="true" data-detail-enhancement="disabled">{detail?<header className="task-ideal-header" data-layout-owned="task"><div className="task-ideal-title"><span className="task-reference-title-icon"><ClipboardList size={24}/></span><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{titleAccessory}</div><div className="task-ideal-header-bottom"><div className="task-header-meta">{headerMeta}</div><div className="task-overlay-header-actions">{headerActions}</div></div><button type="button" className="task-ideal-close" onClick={onClose} aria-label="Fechar"><X size={21}/></button></header>:<header><div><span className="eyebrow">{eyebrow}</span>{titleAccessory?<div className="task-reference-title"><span className="task-reference-title-icon"><Layers size={24}/></span><h2>{title}</h2>{titleAccessory}</div>:<h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}{headerMeta && <div className="task-header-meta">{headerMeta}</div>}</div>{headerActions && <div className="task-overlay-header-actions">{headerActions}</div>}<button onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>}<div className="task-modal-body">{children}</div></div></div>;
}
