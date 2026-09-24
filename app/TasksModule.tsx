"use client";

import {
  Bell, Check, CheckCircle2, ChevronRight, CircleDot, Clipboard, Clock3, Columns3,
  Code2, FileText, History, List, MessageSquareText, Paperclip, Pencil, Plus, Search, Upload,
  Power, RotateCcw, Settings, Smile, Trash2, UserRound, UsersRound, X,
} from "lucide-react";
import { createContext, FormEvent, useContext, useEffect, useMemo, useRef, useState } from "react";

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
  attachments: Array<{ id: string; fileName: string; url: string; createdAt: string }>;
  participantUserIds: string[];
};
type Department = { id: string; name: string; description: string; active: boolean; requiresAssigneeOnTransfer: boolean; coordinatorUserIds: string[] };
type Priority = { id: string; name: string; severityOrder: number; color: string; defaultDueMinutes: number | null; active: boolean };
type Status = { id: string; name: string; departmentId: string | null; displayOrder: number; kanbanColumn: string; isInitial: boolean; isFinal: boolean; acceptsNewTasks: boolean; manualMovement: boolean; requiresJustification: boolean; active: boolean };
type TaskType = { id: string; name: string; description: string; defaultPriorityId: string | null; defaultSlaPolicyId: string | null; initialStatusId: string; departmentIds: string[]; allowedStatusIds: string[]; active: boolean };
type Sla = { id: string; name: string; departmentId: string; taskTypeId: string | null; priorityId: string | null; firstResponseMinutes: number; serviceStartMinutes: number; completionMinutes: number; businessDays: number[]; businessStart: string; businessEnd: string; alertBeforeMinutes: number; escalationMinutes: number; recalculateOnTransfer: boolean; pauseStatusIds: string[]; active: boolean };
type Collaborator = { id: string; name: string; email: string; phone: string; jobTitle: string; photoDataUrl: string; active: boolean; departmentIds: string[]; coordinatorDepartmentIds: string[] };
type Notification = { id: string; taskId: string; taskNumber: number; eventType: string; message: string; read: boolean; createdAt: string };
type TaskComment = { id: string; authorUserId: string; authorName: string; body: string; internal: boolean; createdAt: string; attachments: Array<{ id: string; commentId: string | null; fileName: string; url: string; createdAt: string }> };
type TaskHistory = { id: string; eventType: string; summary: string; actorName: string; previousValue: string; newValue: string; source: string; justification: string; createdAt: string };

type CustomerOption = { id: string; trade_name: string; legal_name?: string; document_masked?: string };

type Props = {
  module: TaskModuleData;
  customers: CustomerOption[];
  user: { email: string; displayName: string; role: string; department: string; isCoordinator: boolean };
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  capabilities: string[];
  busy: boolean;
  operate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string; createdProtocol?: string } | false>;
  onSendToDevelopment: (task: CorporateTask) => Promise<{ id?: string; createdProtocol?: string } | false>;
  uploadAttachments: (taskId: string, files: File[], commentId?: string) => Promise<boolean>;
  deleteAttachment: (attachmentId: string) => Promise<boolean>;
  onOpenSettings: () => void;
};

const dt = (value?: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "—";

export default function TasksModule({ module, customers, user, canCreate, canEdit, canManage, capabilities, busy, operate, onSendToDevelopment, uploadAttachments, deleteAttachment, onOpenSettings }: Props) {
  const [view, setView] = useState<"kanban" | "list">("list");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [clientNotice, setClientNotice] = useState("Todos");
  const [selected, setSelected] = useState<CorporateTask | null>(null);
  const [editRequested, setEditRequested] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdProtocol, setCreatedProtocol] = useState("");
  const has = (capability: string) => canManage || capabilities.includes(capability);
  const currentCollaborator = module.collaborators.find((item) => item.email.toLowerCase() === user.email.toLowerCase());
  const responsibleDepartmentIds = currentCollaborator?.coordinatorDepartmentIds.length
    ? currentCollaborator.coordinatorDepartmentIds
    : currentCollaborator?.departmentIds ?? [];
  const availableDepartments = module.departments.filter((item) => item.active && (!currentCollaborator || responsibleDepartmentIds.includes(item.id)));
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
      return (!needle || text.includes(needle))
        && (!departmentFilter || task.currentDepartmentId === departmentFilter)
        && (!priorityFilter || task.priorityId === priorityFilter)
        && (!assigneeFilter || task.assigneeUserId === assigneeFilter)
        && (clientNotice === "Todos" || task.clientNotificationState === clientNotice)
        && (!onlyMine || task.assigneeName === user.displayName || task.creatorName === user.displayName);
    });
  }, [module.tasks, query, departmentFilter, priorityFilter, assigneeFilter, clientNotice, onlyMine, user.displayName]);

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
    if (!canEdit || !has("changeStatus") || task.statusId === statusId) return;
    const target = module.statuses.find((status) => status.id === statusId);
    const justification = target?.requiresJustification ? window.prompt("Justificativa obrigatória:") : "";
    if (target?.requiresJustification && !justification) return;
    await operate({ action: "changeTaskStatus", taskId: task.id, statusId, justification, version: task.version }, `Tarefa movida para ${target?.name}.`);
  };

  return <div className="tasks-module">
    <header className="tasks-heading module-page-header">
      <div className="module-page-title"><span className="module-page-title-icon"><Clipboard size={21} /></span><span className="module-page-copy"><span className="eyebrow">OPERAÇÃO CORPORATIVA</span><h1>Tarefas</h1><p>Demandas internas, responsáveis, setores e SLA em um fluxo auditável.</p></span></div>
      <div className="tasks-heading-actions module-page-actions">
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
      <nav className="task-department-tabs" aria-label="Selecionar setor"><button className={!departmentFilter ? "active" : ""} onClick={() => setDepartment("")}>Todos os setores</button>{availableDepartments.map((item) => <button className={departmentFilter === item.id ? "active" : ""} onClick={() => setDepartment(item.id)} key={item.id}>{item.name}</button>)}</nav>
      <div className="tasks-toolbar">
        <div className="task-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por protocolo, título ou cliente" /></div>
        <select value={priorityFilter} onChange={(e) => setPriority(e.target.value)} aria-label="Filtrar prioridade"><option value="">Todas as prioridades</option>{module.priorities.filter((p) => p.active).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select>
        <select value={assigneeFilter} onChange={(e) => setAssignee(e.target.value)} aria-label="Filtrar responsável"><option value="">Todos os responsáveis</option>{module.collaborators.filter((c) => c.active).map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
        <label className="mine-filter"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Somente minhas</label>
      </div>
      <details className="task-secondary-filters">
        <summary><Bell size={14} /> Comunicação com o cliente <span>{clientNotice === "Todos" ? "Todos os estados" : clientNotice}</span></summary>
        <div className="task-client-notice-tabs">{["Todos", "Avisar Cliente", "Sem Necessidade", "Cliente Informado", "Pendente"].map((state) => <button className={clientNotice === state ? "active" : ""} onClick={() => setClientNotice(state)} key={state}>{state}<b>{state === "Todos" ? module.tasks.length : module.tasks.filter((task) => task.clientNotificationState === state).length}</b></button>)}</div>
      </details>
      <div className="task-workspace-content">
        {view === "kanban" && <Kanban tasks={filtered} statuses={module.statuses} collaborators={module.collaborators} departmentId={departmentFilter} canEdit={canEdit} onOpen={openTask} onEdit={task=>openTask(task,true)} onMove={move} onDelete={task=>{void operate({action:"deleteTask",taskId:task.id,version:task.version},"Tarefa excluída com sucesso.")}} />}
        {view === "list" && <TaskList tasks={filtered} collaborators={module.collaborators} onOpen={openTask} />}
      </div>
    </section>

    {creating && <CreateTaskModal module={module} customers={customers} user={user} departmentIds={availableDepartments.map((item) => item.id)} busy={busy} onClose={() => setCreating(false)} onSubmit={async (payload, files) => {
      const result = await operate({ action: "createTask", ...payload }, "Tarefa criada, protocolo e SLA calculados.");
      if (!result) return;
      setCreating(false);
      if (result.id && files.length > 0) await uploadAttachments(result.id, files);
      setCreatedProtocol(result.createdProtocol ?? "");
    }} />}
    {selected && <TaskDetail task={module.tasks.find((t) => t.id === selected.id) ?? selected} module={module} customers={customers} user={user} canManage={canManage} canEdit={canEdit} startEditing={editRequested} has={has} busy={busy} onClose={closeTask} operate={operate} onSendToDevelopment={onSendToDevelopment} uploadAttachments={uploadAttachments} deleteAttachment={deleteAttachment} />}
    {createdProtocol && <TaskCreatedModal protocol={createdProtocol} onClose={() => setCreatedProtocol("")} />}
  </div>;
}

function Kanban({ tasks, statuses, collaborators, departmentId, canEdit, onOpen, onEdit, onMove, onDelete }: { tasks: CorporateTask[]; statuses: Status[]; collaborators: Collaborator[]; departmentId: string; canEdit: boolean; onOpen: (task: CorporateTask) => void; onEdit: (task: CorporateTask) => void; onMove: (task: CorporateTask, statusId: string) => void; onDelete: (task: CorporateTask) => void }) {
  const [limits, setLimits] = useState<Record<string, number>>({});
  const visibleStatuses = statuses
    .filter((status) => status.active && (!departmentId || !status.departmentId || status.departmentId === departmentId))
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return <div className="task-board">{visibleStatuses.map((status) => {
    const column = tasks.filter((task) => task.statusId === status.id);
    const limit = limits[status.id] ?? 10;
    const visibleTasks = column.slice(0, limit);
    return <section className="task-column" key={status.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
      const task = tasks.find((entry) => entry.id === e.dataTransfer.getData("taskId"));
      if (task) void onMove(task, status.id);
    }}>
      <header><span><CircleDot size={14} />{status.kanbanColumn || status.name}</span><b>{column.length}</b></header>
      <div>{column.length === 0 && <p className="task-column-empty">Nenhuma tarefa nesta etapa.</p>}{visibleTasks.map((task) => <article draggable tabIndex={0} role="button" className={`task-card ${task.completedAt ? "completed" : task.slaState === "Vencido" ? "overdue" : ""}`} key={task.id}
        onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)} onClick={() => onOpen(task)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(task); } }}>
        <div className="task-card-top"><span className="task-card-code"><Clipboard size={15} /><b>{task.protocol}</b></span>{canEdit && task.canModify && <span className="task-card-actions"><button type="button" onClick={event => { event.stopPropagation(); onEdit(task); }} title="Editar tarefa" aria-label="Editar tarefa"><Pencil size={15}/></button><button type="button" className="delete" onClick={event => { event.stopPropagation(); onDelete(task); }} title="Excluir tarefa" aria-label="Excluir tarefa"><Trash2 size={15}/></button></span>}</div>
        <strong className="task-card-title">{task.title}</strong>
        {(task.customerName || task.customerCode) && <div className="task-card-customer"><UserRound size={15}/><span>Cliente</span><b>{task.customerName || "Não informado"}</b>{task.customerCode && <small><FileText size={13}/> ID {task.customerCode}</small>}</div>}
        <div className="task-card-description"><FileText size={15}/><span><small>Descrição</small><p>{task.description || "Sem descrição informada."}</p></span></div>
        <div className="task-card-labels"><span className="task-card-type"><CircleDot size={13}/>{task.typeName}</span><TaskClientStateBadge state={task.clientNotificationState}/></div>
        <div className="task-card-meta"><span className="task-card-priority"><i style={{ background: task.priorityColor }}/>{task.priorityName}</span><span className={`sla-chip ${task.completedAt ? "completed" : task.slaState.toLowerCase().replaceAll(" ", "-")}`}><Clock3 size={12} /> {task.completedAt ? "Concluída" : `${task.slaState} · ${dt(task.slaDueAt)}`}</span></div>
        <footer><span className="task-card-department"><UsersRound size={14} /> {task.departmentName}</span><span className="task-card-owner"><CollaboratorAvatar collaborator={collaborators.find((item) => item.id === task.assigneeUserId)} /><span><small>Responsável</small><b>{task.assigneeName}</b></span><ChevronRight size={17} className="task-card-open-icon" /></span></footer>
      </article>)}{column.length > visibleTasks.length && <button type="button" className="task-column-more" onClick={() => setLimits((current) => ({ ...current, [status.id]: limit + 10 }))}>Ver mais ({column.length - visibleTasks.length})</button>}</div>
    </section>;
  })}</div>;
}

function TaskList({ tasks, collaborators, onOpen }: { tasks: CorporateTask[]; collaborators: Collaborator[]; onOpen: (task: CorporateTask) => void }) {
  return <div className="task-table"><div className="task-table-row head"><span>Código / tarefa</span><span>Tipo</span><span>Setor</span><span>Prioridade</span><span>Status</span><span>Responsável</span><span>Prazo / SLA</span><span>Atualização</span></div>
    {tasks.length === 0 ? <div className="task-empty">Nenhuma tarefa encontrada com estes filtros.</div> : tasks.map((task) => <button className="task-table-row" onClick={() => onOpen(task)} key={task.id}>
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

function CreateTaskModal({ module, customers, user, departmentIds, busy, onClose, onSubmit }: { module: TaskModuleData; customers: CustomerOption[]; user: Props["user"]; departmentIds: string[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>, files: File[]) => void }) {
  const originDepartment = module.departments.find((department) => department.active && departmentIds.includes(department.id) && department.name.toLocaleLowerCase("pt-BR") === user.department.toLocaleLowerCase("pt-BR"))
    ?? module.departments.find((department) => department.active && departmentIds.includes(department.id));
  const [departmentId, setDepartmentId] = useState(originDepartment?.id ?? "");
  const validTypes = module.types.filter((t) => t.active && t.departmentIds.includes(departmentId));
  const selectedDepartment = module.departments.find((department) => department.id === departmentId);
  const sectorCoordinators = module.collaborators.filter((item) => item.active && item.coordinatorDepartmentIds.includes(departmentId));
  const [customerId, setCustomerId] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const resolveCustomerCode = (value: string) => {
    setCustomerCode(value);
    const normalized = value.trim().toLocaleLowerCase("pt-BR");
    const digits = value.replace(/\D/g, "");
    const customer = customers.find((item) => item.id.toLocaleLowerCase("pt-BR") === normalized
      || (digits.length > 0 && item.document_masked?.replace(/\D/g, "") === digits));
    if (customer) setCustomerId(customer.id);
  };
  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((item) => item.id === id);
    if (customer) setCustomerCode(customer.id);
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const files = f.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    onSubmit({
      title: f.get("title"), description: f.get("description"),
      typeId: f.get("typeId"), priorityId: null, statusId: null,
      sourceDepartmentId: departmentId, currentDepartmentId: departmentId, assigneeUserId: null,
      customerId: customerId || null, customerCode,
      clientWhatsApp: f.get("clientWhatsApp"), internalNotes: "", dueAt: null, slaPolicyId: null,
      cancellationRequest: false,
      participantUserIds: f.getAll("participantUserIds"),
    }, files);
  };
  return <Overlay title="Nova tarefa" eyebrow="TAREFAS" subtitle="Informe a solicitação. A coordenação fará a classificação após o cadastro." onClose={onClose}><form className="task-form task-create-form" onSubmit={submit}>
    <section className="task-form-section wide">
      <header><span>01</span><div><h3>Solicitação</h3><p>Descreva de forma simples o que precisa ser analisado.</p></div></header>
      <div className="task-form-section-grid">
        <label className="wide">Título *<input name="title" required placeholder="Resuma a demanda em uma frase" /></label>
        <label>Cliente<select name="customerId" value={customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">Sem cliente vinculado</option>{customers.map((c) => <option value={c.id} key={c.id}>{c.trade_name}</option>)}</select></label>
        <label>ID do cliente<input name="customerCode" value={customerCode} onChange={(event) => resolveCustomerCode(event.target.value)} placeholder="Informe o ID cadastrado" />{customerId && <small className="task-customer-linked">Cliente vinculado automaticamente</small>}</label>
        <label>WhatsApp do cliente *<input name="clientWhatsApp" type="tel" required minLength={10} placeholder="(11) 99999-9999" /></label>
        <div className="task-readonly-field"><span>Setor responsável</span><strong>{selectedDepartment?.name ?? "Setor não configurado"}</strong></div>
        <div className="task-readonly-field"><span>Aprovador</span><strong>{sectorCoordinators.map((item) => item.name).join(", ") || "Coordenador do setor não cadastrado"}</strong><small>A conclusão ficará pendente até a aprovação do coordenador.</small></div>
        <label className="wide">Tipo de tarefa *<select name="typeId" required><option value="">Selecionar...</option>{validTypes.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
        <label className="wide">Resumo detalhado *<textarea name="description" required rows={6} placeholder="Explique o problema, o resultado esperado e as informações necessárias para a análise." /></label>
      </div>
    </section>
    <section className="task-form-section wide">
      <header><span>02</span><div><h3>Acesso e evidências</h3><p>Inclua participantes e arquivos somente quando forem necessários.</p></div></header>
      <div className="task-form-section-grid">
        <fieldset className="wide task-participants"><legend>Colaboradores participantes</legend><p>Somente participantes, criador, responsável e coordenação terão acesso.</p>{module.collaborators.filter((item) => item.active).map((item) => <label key={item.id}><input type="checkbox" name="participantUserIds" value={item.id} /> <CollaboratorAvatar collaborator={item} /> {item.name}</label>)}</fieldset>
        <label className="wide task-file-picker">Fotos e vídeos <input name="files" type="file" accept="image/*,video/*" multiple /><small>Até 10 arquivos por envio, com no máximo 25 MB cada.</small></label>
      </div>
    </section>
    <div className="task-form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? "Salvando..." : "Criar tarefa"}</button></div>
  </form></Overlay>;
}

function EditTaskModal({ task, module, customers, busy, onClose, onSubmit }: { task: CorporateTask; module: TaskModuleData; customers: CustomerOption[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const validTypes = module.types.filter((type) => type.active && type.departmentIds.includes(task.currentDepartmentId));
  const [customerId, setCustomerId] = useState(task.customerId ?? "");
  const [customerCode, setCustomerCode] = useState(task.customerCode);
  const resolveCustomerCode = (value: string) => {
    setCustomerCode(value);
    const normalized = value.trim().toLocaleLowerCase("pt-BR");
    const digits = value.replace(/\D/g, "");
    const customer = customers.find((item) => item.id.toLocaleLowerCase("pt-BR") === normalized
      || (digits.length > 0 && item.document_masked?.replace(/\D/g, "") === digits));
    if (customer) setCustomerId(customer.id);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      title: form.get("title"), description: form.get("description"), typeId: form.get("typeId"),
      customerId: customerId || null, customerCode,
      clientWhatsApp: form.get("clientWhatsApp"), cancellationRequest: false,
      participantUserIds: form.getAll("participantUserIds"), version: task.version,
    });
  };
  return <Overlay title="Editar tarefa" eyebrow={task.protocol} subtitle="Atualize somente as informações da solicitação." onClose={onClose}><form className="task-form task-edit-form" onSubmit={submit}>
    <label className="wide">Título *<input name="title" required defaultValue={task.title} /></label>
    <label>Cliente<select name="customerId" value={customerId} onChange={(event) => { setCustomerId(event.target.value); const customer = customers.find((item) => item.id === event.target.value); if (customer) setCustomerCode(customer.id); }}><option value="">Sem cliente vinculado</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name}</option>)}</select></label>
    <label>ID do cliente<input name="customerCode" value={customerCode} onChange={(event) => resolveCustomerCode(event.target.value)} placeholder="Informe o ID cadastrado" />{customerId && <small className="task-customer-linked">Cliente vinculado automaticamente</small>}</label>
    <label>WhatsApp do cliente *<input name="clientWhatsApp" required minLength={10} defaultValue={task.clientWhatsApp} /></label>
    <label>Tipo *<select name="typeId" required defaultValue={task.typeId}>{validTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
    <label className="wide">Resumo detalhado *<textarea name="description" required rows={6} defaultValue={task.description} /></label>
    <fieldset className="wide task-participants"><legend>Colaboradores participantes</legend>{module.collaborators.filter((item) => item.active).map((item) => <label key={item.id}><input type="checkbox" name="participantUserIds" value={item.id} defaultChecked={task.participantUserIds.includes(item.id)} /> <CollaboratorAvatar collaborator={item} /> {item.name}</label>)}</fieldset>
    <div className="task-form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</button></div>
  </form></Overlay>;
}

function TaskDetail({ task, module, customers, user, canManage, canEdit, startEditing, has, busy, onClose, operate, onSendToDevelopment, uploadAttachments, deleteAttachment }: { task: CorporateTask; module: TaskModuleData; customers: CustomerOption[]; user: Props["user"]; canManage: boolean; canEdit: boolean; startEditing: boolean; has: (cap: string) => boolean; busy: boolean; onClose: () => void; operate: Props["operate"]; onSendToDevelopment: Props["onSendToDevelopment"]; uploadAttachments: Props["uploadAttachments"]; deleteAttachment: Props["deleteAttachment"] }) {
  const [comment, setComment] = useState("");
  const [transferDepartment, setTransferDepartment] = useState(module.departments.find((department) => department.active && department.id !== task.currentDepartmentId)?.id ?? "");
  const [transferAssignee, setTransferAssignee] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [showEmojis, setShowEmojis] = useState(false);
  const [clientNoticeOpen, setClientNoticeOpen] = useState(false);
  const [clientNoticeMessage, setClientNoticeMessage] = useState(`Avisar o cliente sobre a tarefa ${task.protocol}.`);
  const [editing, setEditing] = useState(startEditing && canEdit && task.canModify);
  const [sentToDevelopment, setSentToDevelopment] = useState(false);
  const [developmentSubtaskId, setDevelopmentSubtaskId] = useState(() => task.comments.map((entry) => entry.body.match(/\[TI:([^\]]+)\]/)?.[1]).find(Boolean) ?? "");
  const [responsibleUserId, setResponsibleUserId] = useState(task.assigneeUserId ?? "");
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const availableAssignees = module.collaborators.filter((c) => c.active && c.departmentIds.includes(transferDepartment));
  const currentDepartmentAssignees = module.collaborators.filter((collaborator) => collaborator.active && collaborator.departmentIds.includes(task.currentDepartmentId));
  const taskType = module.types.find((type) => type.id === task.typeId);
  const allowedStatusIds = new Set(taskType?.allowedStatusIds ?? []);
  const availableStatuses = module.statuses.filter((status) => status.active && status.manualMovement && (allowedStatusIds.size === 0 || allowedStatusIds.has(status.id) || /aguardando\s+aprova/i.test(status.name)) && (!status.departmentId || status.departmentId === task.currentDepartmentId));
  const finalStatus = availableStatuses.find((status) => status.isFinal && /conclu|finaliz/i.test(status.name)) ?? availableStatuses.find((status) => status.isFinal);
  const approvalStatus = availableStatuses.find((status) => /aguardando\s+aprova/i.test(status.name));
  const approverUserId = task.comments.map((entry) => entry.body.match(/\[APROVADOR:([^\]]+)\]/)?.[1]).find(Boolean) ?? "";
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
  const selectAndUploadAttachments = async (files: File[]) => {
    setAttachmentFiles(files);
    if (files.length === 0) return;
    if (await uploadAttachments(task.id, files)) {
      setAttachmentFiles([]);
      setFileInputKey((value) => value + 1);
    }
  };
  return <Overlay title={`#${task.number} — ${task.title}`} eyebrow="DETALHES DA TAREFA" onClose={onClose} wide side detail headerActions={<>
    <span className="task-header-status"><CircleDot size={14} /> {task.statusName}</span>
    <TaskClientStateBadge state={task.clientNotificationState}/>
    <span className="task-header-subtitle">{task.departmentName} · Atualizada em {dt(task.updatedAt)}</span>
    <button className="copy-task-link" onClick={async () => { const url = new URL(window.location.href); url.searchParams.set("mod", "tasks"); url.searchParams.set("task", task.id); await navigator.clipboard.writeText(url.toString()); }}><Clipboard size={14} /> Copiar link</button>
    {developmentSubtaskId ? <button className="task-dev-detail-action" type="button" onClick={() => { window.location.href = `/?mod=ti&subtask=${developmentSubtaskId}`; }}><Code2 size={15} /> Acessar subtarefa de TI</button> : canEdit && <button className="task-dev-detail-action" type="button" disabled={busy || sentToDevelopment} title="Enviar esta tarefa para a triagem de desenvolvimento" onClick={() => { void onSendToDevelopment(task).then((result) => { if (result) { setSentToDevelopment(true); setDevelopmentSubtaskId(result.id ?? ""); } }); }}><Code2 size={15} /> {sentToDevelopment ? "Enviada para Desenvolvimento" : "Enviar para Desenvolvimento"}</button>}
  </>}>
    <div className="task-detail-layout">
    <section className="task-description-card"><h3><FileText size={17} /> Descrição da tarefa</h3><p>{task.description}</p></section>
    <section className="task-detail-summary">
      <header><Clipboard size={16} /> <strong>Resumo</strong></header>
      <div><span>Protocolo</span><strong>{task.protocol}</strong></div>
      <div><span>Setor atual</span><strong>{task.departmentName}</strong></div>
      <div><span>Cliente</span><strong>{task.customerCode || task.customerName || "Não vinculado"}</strong></div>
      <div className={`task-summary-sla ${/venc/i.test(task.slaState) ? "overdue" : ""}`}><span>SLA</span><strong>{task.slaState}</strong></div>
      <div className={`task-summary-priority ${/alta|urgente|crítica|critica/i.test(task.priorityName) ? "high" : ""}`}><span>Prioridade</span><strong>{task.priorityName}</strong></div>
      <div><span>Criado por</span><strong>{task.creatorName}</strong></div>
      <div><span>Tipo</span><strong>{task.typeName}</strong></div>
      <div><span>Última atualização</span><strong>{dt(task.updatedAt)}</strong></div>
      <div><span>Data de criação</span><strong>{dt(task.createdAt)}</strong></div>
      <div className="task-summary-owner" data-collaborator-id={task.assigneeUserId}><span><small>Responsável</small><strong>{task.assigneeName}</strong></span><CollaboratorAvatar collaborator={module.collaborators.find((item) => item.id === task.assigneeUserId)} /></div>
      {approver && <div className="task-summary-approver" data-collaborator-id={approver.id}><span>Aprovador</span><strong>{approver.name}</strong></div>}
    </section>
    {canEdit && task.canModify && <section className="task-owner-controls"><div><span>GESTÃO DA SOLICITAÇÃO</span><strong>Você pode editar ou excluir esta tarefa.</strong></div><button onClick={() => setEditing(true)}><Pencil size={15} /> Editar</button><button className="delete" onClick={async () => { const result = await operate({ action: "deleteTask", taskId: task.id, version: task.version }, "Tarefa excluída com sucesso."); if (result) onClose(); }}><Trash2 size={15} /> Excluir</button></section>}
    <div className="task-files-panel">
      <div><h3><Paperclip size={16} /> Anexos</h3><span>{task.attachments?.length ?? 0} arquivo(s)</span></div>
      {(task.attachments?.length ?? 0) > 0
        ? <div className="task-attachment-grid">{task.attachments.map((attachment) => <TaskAttachmentPreview key={attachment.id} attachment={attachment} canDelete={canEdit} busy={busy} onDelete={deleteAttachment} />)}</div>
        : <p>Nenhum arquivo anexado.</p>}
      {canEdit && <div className="task-file-upload">
        <label className="task-upload-picker"><Paperclip size={15} /> {attachmentFiles.length ? `${attachmentFiles.length} arquivo(s) selecionado(s)` : "Selecionar imagens, vídeos ou arquivos"}<input ref={attachmentInput} key={fileInputKey} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" multiple onChange={(event) => void selectAndUploadAttachments(Array.from(event.currentTarget.files ?? []))} aria-label="Selecionar arquivos para anexar" /></label>
        <button type="button" disabled={busy} onClick={() => attachmentInput.current?.click()}><Upload size={15} /> {busy ? "Enviando..." : "Adicionar arquivos"}</button>
      </div>}
      {attachmentFiles.length > 0 && <div className="task-upload-preview">{attachmentFiles.map((file) => <TaskFilePreview key={`${file.name}-${file.lastModified}`} file={file} />)}</div>}
    </div>
    <section className="task-actions-panel">
      <header><div><span>AÇÕES DA TAREFA</span><h3>Atualizar e comunicar</h3></div><p>Use os controles abaixo para alterar o fluxo ou solicitar uma ação.</p></header>
      {canEdit && has("changeStatus") && finalStatus && <div className="task-quick-workflow">
        {canEdit && has("changeStatus") && approvalStatus && finalStatus && !task.completedAt && task.statusId !== approvalStatus.id && <button className="task-complete-button" type="button" disabled={busy} onClick={() => void operate({ action: "changeTaskStatus", taskId: task.id, statusId: approvalStatus.id, justification: "Encaminhada para aprovação.", version: task.version }, "Tarefa enviada para aprovação.")}><CheckCircle2 size={17} /> Enviar para aprovação</button>}
        {canEdit && has("changeStatus") && approvalStatus && finalStatus && task.statusId === approvalStatus.id && canApprove && <button className="task-complete-button" type="button" disabled={busy} onClick={() => void operate({ action: "changeTaskStatus", taskId: task.id, statusId: finalStatus.id, justification: "Aprovada pela coordenação.", version: task.version }, "Tarefa aprovada e concluída com sucesso.")}><CheckCircle2 size={17} /> Aprovar e concluir</button>}
        {canEdit && has("changeStatus") && task.completedAt && resumeStatus && <button className="task-resume-control" type="button" disabled={busy} onClick={() => void operate({ action: "changeTaskStatus", taskId: task.id, statusId: resumeStatus.id, justification: "Tarefa retomada.", version: task.version }, "Tarefa retomada com sucesso.")}><RotateCcw size={16} /> Retomar tarefa</button>}
      </div>}
      <div className="task-action-fields">
        {canEdit && has("transferAssignee") && <div className="task-responsible-transfer"><label><span>Transferir responsável</span><select value={responsibleUserId} onChange={(event) => setResponsibleUserId(event.target.value)}><option value="">Fila compartilhada</option>{currentDepartmentAssignees.map((collaborator) => <option value={collaborator.id} key={collaborator.id}>{collaborator.name}</option>)}</select></label><button type="button" disabled={busy || responsibleUserId === (task.assigneeUserId ?? "")} onClick={() => void operate({ action: "assignTask", taskId: task.id, assigneeUserId: responsibleUserId || null, version: task.version }, "Responsável transferido com sucesso.")}><UsersRound size={15} /> Transferir</button></div>}
        {canEdit && has("changeStatus") && <label className="status-control"><span>Status</span><select value={task.statusId} onChange={async (e) => {
          const target = module.statuses.find((s) => s.id === e.target.value);
          const justification = target?.requiresJustification ? window.prompt("Justificativa obrigatória:") : "";
          if (!target?.requiresJustification || justification) await operate({ action: "changeTaskStatus", taskId: task.id, statusId: e.target.value, justification, version: task.version }, "Status atualizado.");
        }}>{availableStatuses.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
        {canEdit && has("changePriority") && <label className="priority-control"><span>Prioridade</span><select value={task.priorityId} onChange={(e) => void operate({ action: "changeTaskPriority", taskId: task.id, priorityId: e.target.value, version: task.version }, "Prioridade atualizada.")}>{module.priorities.filter((p) => p.active).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}
        {canEdit && has("changeSla") && <label className="sla-control"><span>Política de SLA</span><select value={task.slaPolicyId ?? ""} onChange={(e) => void operate({ action: "changeTaskSla", taskId: task.id, slaPolicyId: e.target.value || null, version: task.version }, "SLA recalculado.")}><option value="">Sem SLA</option>{module.slaPolicies.filter((s) => s.active && s.departmentId === task.currentDepartmentId).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
      </div>
      <div className="task-action-buttons">
        {canEdit && has("assume") && !task.assigneeUserId && <button className="assume-action" disabled={busy} onClick={() => operate({ action: "assignTask", taskId: task.id, version: task.version }, "Tarefa assumida.")}><Check size={15} /> Assumir tarefa</button>}
        <button className={`contact-action ${task.clientNotificationState==="Avisar Cliente"?"selected":""}`} type="button" onClick={() => setClientNoticeOpen(true)}><Bell size={15} /> Avisar cliente</button>
        <button className="whatsapp-action" onClick={() => { window.location.href = `/?mod=chat&phone=${encodeURIComponent(task.clientWhatsApp)}&task=${encodeURIComponent(task.protocol)}`; }}><MessageSquareText size={15} /> Abrir no WhatsApp</button>
        <button className={`notify-action ${task.clientNotificationState==="Cliente Informado"?"selected":""}`} onClick={() => void operate({ action: "communicateWithClient", taskId: task.id, clientAction: "clientInformed", channel: "Interno", message: `Cliente informado sobre a tarefa ${task.protocol}.` }, "Cliente marcado como informado.")}><CheckCircle2 size={15} /> Cliente informado</button>
        <button className={`no-need-action ${task.clientNotificationState==="Sem Necessidade"?"selected":""}`} onClick={() => void operate({ action: "communicateWithClient", taskId: task.id, clientAction: "noNeed", channel: "Interno", message: "Sem necessidade de comunicação com o cliente." }, "Tarefa marcada sem necessidade de aviso.")}><Check size={15} /> Sem necessidade</button>
      </div>
    </section>
    {canEdit && has("forward") && (canManage || user.isCoordinator) && module.departments.some((department) => department.active && department.id !== task.currentDepartmentId) && <div className="task-transfer"><div><span>TRANSFERÊNCIA DE SETOR</span><h3>Encaminhar tarefa</h3><p>Ela sairá do quadro de <b>{task.departmentName}</b> e entrará na etapa inicial do setor de destino.</p></div><label>Setor de destino<select value={transferDepartment} onChange={(e) => { setTransferDepartment(e.target.value); setTransferAssignee(""); }}><option value="">Selecionar setor</option>{module.departments.filter((d) => d.active && d.id !== task.currentDepartmentId).map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select></label><label>Novo responsável<select value={transferAssignee} onChange={(e) => setTransferAssignee(e.target.value)}><option value="">Fila compartilhada</option>{availableAssignees.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label className="task-transfer-reason">Motivo<input value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Explique o encaminhamento" /></label><button disabled={busy || !transferDepartment || !transferReason.trim()} onClick={async () => { const result = await operate({ action: "transferTask", taskId: task.id, departmentId: transferDepartment, assigneeUserId: transferAssignee || null, reason: transferReason.trim(), recalculateSla: true, version: task.version }, "Tarefa encaminhada para o novo setor."); if (result) onClose(); }}>Encaminhar tarefa</button></div>}
    <div className="task-detail-grid">
      <section className="task-conversation-card"><header><h3><MessageSquareText size={17} /> Comentários</h3><span>{task.comments.length}</span></header><div className="task-comments">{task.comments.length === 0 ? <p className="task-empty-message">Nenhum comentário registrado.</p> : task.comments.map((c) => <article key={c.id} className="task-comment-entry"><CollaboratorAvatar collaborator={module.collaborators.find((item) => item.id === c.authorUserId)} /><div><b>{c.authorName}</b><time>{dt(c.createdAt)}</time><p>{c.body}</p>{c.attachments?.length > 0 && <div className="comment-attachments">{c.attachments.map((file) => <a href={file.url} target="_blank" rel="noreferrer" key={file.id}><Paperclip size={13} /> {file.fileName}</a>)}</div>}</div></article>)}</div>
        {canEdit && <form onSubmit={async (e) => { e.preventDefault(); if (!comment.trim()) return; const result = await operate({ action: "addTaskComment", taskId: task.id, body: comment }, "Comentário registrado."); if (result) { if (result.id && commentFiles.length > 0) await uploadAttachments(task.id, commentFiles, result.id); setComment(""); setCommentFiles([]); setShowEmojis(false); } }}><label htmlFor="task-comment">Adicionar comentário</label><textarea ref={commentInput} id="task-comment" rows={5} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={"Escreva a atualização aqui.\nUse novas linhas para organizar tópicos e detalhes."} /><div className="task-comment-tools"><button className={showEmojis ? "active" : ""} type="button" onClick={() => setShowEmojis((value) => !value)} aria-label="Adicionar emoji"><Smile size={15} /> Emoji</button><label className="comment-file-picker"><Paperclip size={14} /> Anexar fotos<input type="file" accept="image/*" multiple onChange={(event) => setCommentFiles(Array.from(event.target.files ?? []))} /></label>{showEmojis && <div className="task-emoji-picker" aria-label="Emojis rápidos">{["😀", "👍", "✅", "🎯", "🚨", "🙏", "📌", "💬", "📎", "🚀"].map((emoji) => <button type="button" onClick={() => insertEmoji(emoji)} key={emoji} aria-label={`Inserir ${emoji}`}>{emoji}</button>)}</div>}</div><footer><small>{comment.length} caracteres · {commentFiles.length} foto(s)</small><button disabled={busy || !comment.trim()}><MessageSquareText size={15} /> Publicar comentário</button></footer></form>}</section>
      <section className="task-history-card"><header><h3><History size={17} /> Histórico</h3><span>{task.history.length}</span></header><div className="task-history">{task.history.map((h) => <article key={h.id}><i /><div><b>{h.summary}</b><small>{h.actorName} · {dt(h.createdAt)}</small>{h.justification && <p>Justificativa: {h.justification}</p>}</div></article>)}</div></section>
    </div>
    </div>
    {clientNoticeOpen && <div className="modal-backdrop"><form className="modal task-client-notice-modal" onSubmit={async (event) => { event.preventDefault(); if (!clientNoticeMessage.trim()) return; const result = await operate({ action: "communicateWithClient", taskId: task.id, clientAction: "requestContact", channel: "Interno", message: clientNoticeMessage.trim() }, "O responsável foi avisado para contatar o cliente."); if (result) setClientNoticeOpen(false); }}><div className="modal-header"><div><span className="eyebrow">COMUNICAÇÃO COM CLIENTE</span><h2>Avisar o cliente</h2><p>Envie um aviso interno para que o responsável faça o contato.</p></div><button type="button" onClick={() => setClientNoticeOpen(false)} aria-label="Fechar"><X size={20} /></button></div><div className="modal-body"><label className="field"><span>Orientação para o responsável</span><textarea value={clientNoticeMessage} onChange={(event) => setClientNoticeMessage(event.target.value)} required rows={5} placeholder="Descreva o que precisa ser informado ao cliente." /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setClientNoticeOpen(false)}>Cancelar</button><button className="primary-button" disabled={busy || !clientNoticeMessage.trim()}><Bell size={16} /> Enviar aviso</button></div></form></div>}
    {editing && <EditTaskModal task={task} module={module} customers={customers} busy={busy} onClose={() => setEditing(false)} onSubmit={async (payload) => { const result = await operate({ action: "updateTask", requireConfirmation: true, taskId: task.id, ...payload }, "Tarefa atualizada com sucesso."); if (result) setEditing(false); }} />}
  </Overlay>;
}

const isImageFile = (fileName: string) => /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(fileName);
const isVideoFile = (fileName: string) => /\.(mp4|mov|m4v|webm|ogg)$/i.test(fileName);

function TaskAttachmentPreview({ attachment, canDelete, busy, onDelete }: { attachment: CorporateTask["attachments"][number]; canDelete: boolean; busy: boolean; onDelete: (attachmentId: string) => Promise<boolean> }) {
  return <article className="task-attachment-preview">
    {isImageFile(attachment.fileName) ? <img src={attachment.url} alt={attachment.fileName} /> : isVideoFile(attachment.fileName) ? <video controls preload="metadata"><source src={attachment.url} /></video> : <a href={attachment.url} target="_blank" rel="noreferrer"><Paperclip size={16} /> {attachment.fileName}</a>}
    <footer><span title={attachment.fileName}>{attachment.fileName}</span><a href={attachment.url} target="_blank" rel="noreferrer">Abrir</a>{canDelete && <button type="button" disabled={busy} onClick={() => void onDelete(attachment.id)} aria-label={`Excluir ${attachment.fileName}`}><Trash2 size={14} /></button>}</footer>
  </article>;
}

function TaskFilePreview({ file }: { file: File }) {
  const url = URL.createObjectURL(file);
  return <article className="task-file-preview">{file.type.startsWith("image/") ? <img src={url} alt={file.name} /> : file.type.startsWith("video/") ? <video controls preload="metadata"><source src={url} type={file.type} /></video> : <span><Paperclip size={16} /> {file.name}</span>}<small>{Math.max(1, Math.round(file.size / 1024))} KB</small></article>;
}

export function CatalogsModule({ module, section, onSection, canManage, busy, operate }: { module: TaskModuleData; section: CatalogSection; onSection: (section: CatalogSection) => void; canManage: boolean; busy: boolean; operate: Props["operate"] }) {
  const pages: Record<CatalogSection, { title: string; description: string }> = {
    departments: { title: "Setores", description: "Organize as áreas da empresa, coordenadores e regras de encaminhamento." },
    types: { title: "Tipos de tarefa", description: "Configure os tipos disponíveis, setores responsáveis, fluxo, prioridade e SLA padrão." },
    priorities: { title: "Prioridades", description: "Defina a criticidade, identificação visual e prazo padrão das demandas." },
    statuses: { title: "Status", description: "Monte as etapas e colunas do Kanban utilizadas nos fluxos de tarefas." },
    kanban: { title: "Kanban", description: "Organize a ordem e o nome visual das colunas que recebem as tarefas." },
    sla: { title: "Políticas de SLA", description: "Defina somente o prazo em dias úteis; a contagem começa quando a tarefa é criada." },
    people: { title: "Colaboradores", description: "Gerencie cargo, contato, situação, setores e responsabilidades de coordenação." },
  };
  const page = pages[section];
  return <div className="catalogs-module">
    <header className="catalog-page-heading module-page-header">
      <div className="module-page-title"><span className="module-page-title-icon"><Settings size={21} /></span><span className="module-page-copy"><span className="eyebrow">CADASTROS DO SISTEMA</span><h1>{page.title}</h1><p>{page.description}</p></span></div>
      <span className="catalog-page-context module-page-actions">Cadastros <ChevronRight size={13} /> {page.title}</span>
    </header>
    <nav className="task-catalog-tabs" aria-label="Cadastros de tarefas">{([['types','Tipo'],['priorities','Prioridade'],['sla','SLA'],['statuses','Status'],['kanban','Kanban']] as Array<[CatalogSection,string]>).map(([key,label]) => <button className={section === key ? "active" : ""} onClick={() => onSection(key)} key={key}>{label}</button>)}</nav>
    {!canManage && <div className="readonly-note">Seu grupo possui acesso de consulta. Para alterar cadastros, habilite “Administrar” na tela Cadastros.</div>}
    <TaskSettings key={section} module={module} tab={section} onTab={onSection} canManage={canManage} busy={busy} operate={operate} />
  </div>;
}

function TaskSettings({ module, tab, onTab, canManage, busy, operate }: { module: TaskModuleData; tab: CatalogSection; onTab: (section: CatalogSection) => void; canManage: boolean; busy: boolean; operate: Props["operate"] }) {
  const [editingId, setEditingId] = useState<string | null | undefined>(null);
  const submit = (action: string, success: string) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const payload: Record<string, unknown> = Object.fromEntries(f);
    payload.id = editingId;
    payload.active = f.has("active");
    if (action === "saveTaskDepartment") {
      payload.requiresAssigneeOnTransfer = f.has("requiresAssigneeOnTransfer");
      payload.coordinatorUserIds = f.getAll("coordinatorUserIds");
    }
    if (action === "saveTaskPriority") {
      payload.severityOrder = Number(f.get("severityOrder"));
      payload.defaultDueMinutes = f.get("defaultDueMinutes") ? Number(f.get("defaultDueMinutes")) : null;
    }
    if (action === "saveTaskStatus") {
      payload.displayOrder = Number(f.get("displayOrder"));
      payload.isInitial = f.has("isInitial");
      payload.isFinal = f.has("isFinal");
      payload.requiresJustification = f.has("requiresJustification");
      payload.acceptsNewTasks = f.has("acceptsNewTasks");
      payload.manualMovement = f.has("manualMovement");
    }
    if (await operate({ action, ...payload }, success)) { e.currentTarget.reset(); setEditingId(null); }
  };
  const department = module.departments.find((item) => item.id === editingId);
  const priority = module.priorities.find((item) => item.id === editingId);
  const status = module.statuses.find((item) => item.id === editingId);
  const type = module.types.find((item) => item.id === editingId);
  const removeCatalog = async (catalog: string, id: string, label: string) => {
    await operate({ action: "deleteTaskCatalog", catalog, id }, `${label} excluído com sucesso.`);
    setEditingId(null);
  };
  const toggleCatalog = async (catalog: string, id: string, label: string) => {
    if (catalog === "departments") { const item = module.departments.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskDepartment", id, name: item.name, catalogDescription: item.description, requiresAssigneeOnTransfer: item.requiresAssigneeOnTransfer, coordinatorUserIds: item.coordinatorUserIds, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
    if (catalog === "priorities") { const item = module.priorities.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskPriority", id, name: item.name, severityOrder: item.severityOrder, color: item.color, defaultDueMinutes: item.defaultDueMinutes, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
    if (catalog === "statuses") { const item = module.statuses.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskStatus", id, name: item.name, departmentId: item.departmentId, displayOrder: item.displayOrder, kanbanColumn: item.kanbanColumn, isInitial: item.isInitial, isFinal: item.isFinal, acceptsNewTasks: item.acceptsNewTasks, manualMovement: item.manualMovement, requiresJustification: item.requiresJustification, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
    if (catalog === "types") { const item = module.types.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskType", id, name: item.name, catalogDescription: item.description, defaultPriorityId: item.defaultPriorityId, defaultSlaPolicyId: item.defaultSlaPolicyId, initialStatusId: item.initialStatusId, departmentIds: item.departmentIds, allowedStatusIds: item.allowedStatusIds, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
    if (catalog === "sla") { const item = module.slaPolicies.find((entry) => entry.id === id); if (item) await operate({ action: "saveTaskSla", id, name: item.name, departmentId: item.departmentId, typeId: item.taskTypeId, priorityId: item.priorityId, firstResponseMinutes: item.firstResponseMinutes, serviceStartMinutes: item.serviceStartMinutes, completionMinutes: item.completionMinutes, businessDays: item.businessDays, businessStart: item.businessStart, businessEnd: item.businessEnd, alertBeforeMinutes: item.alertBeforeMinutes, escalationMinutes: item.escalationMinutes, pauseStatusIds: item.pauseStatusIds, recalculateSla: item.recalculateOnTransfer, active: !item.active }, item.active ? `${label} bloqueado temporariamente.` : `${label} reativado com sucesso.`); }
  };
  return <TaskCatalogActions.Provider value={{ remove: removeCatalog, toggle: toggleCatalog }}><div className={`task-settings ${canManage ? "" : "readonly"}`}><section>
        {tab === "sla" && <SimpleSlaEditor module={module} editingId={editingId} setEditingId={setEditingId} busy={busy} operate={operate} />}
        {tab === "departments" && <Catalog title="Setores" editingId={editingId} onEdit={setEditingId} items={module.departments.map((d) => ({ id: d.id, title: d.name, subtitle: d.description, active: d.active }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskDepartment", "Setor salvo.")}><input name="name" required placeholder="Nome do setor" defaultValue={department?.name} /><input name="catalogDescription" placeholder="Descrição" defaultValue={department?.description} /><label><input type="checkbox" name="requiresAssigneeOnTransfer" defaultChecked={department?.requiresAssigneeOnTransfer} /> Exigir responsável</label><CheckGroup legend="Coordenadores" name="coordinatorUserIds" values={module.collaborators.filter((c) => c.active).map((c) => ({ id: c.id, label: c.name }))} selected={department?.coordinatorUserIds ?? []} /><ActiveField value={department?.active} /><FormButtons editing={!!department} busy={busy} onCancel={() => setEditingId(null)} label="setor" /></form></Catalog>}
    {tab === "priorities" && <Catalog title="Prioridades" editingId={editingId} onEdit={setEditingId} items={module.priorities.map((p) => ({ id: p.id, title: p.name, subtitle: `Ordem ${p.severityOrder} · prazo ${p.defaultDueMinutes ?? "—"} min`, active: p.active, color: p.color }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskPriority", "Prioridade salva.")}><input name="name" required placeholder="Nome" defaultValue={priority?.name} /><input name="severityOrder" required type="number" placeholder="Ordem" defaultValue={priority?.severityOrder} /><input name="color" type="color" defaultValue={priority?.color ?? "#2563eb"} /><input name="defaultDueMinutes" type="number" placeholder="Prazo padrão (min)" defaultValue={priority?.defaultDueMinutes ?? ""} /><ActiveField value={priority?.active} /><FormButtons editing={!!priority} busy={busy} onCancel={() => setEditingId(null)} label="prioridade" /></form></Catalog>}
    {tab === "statuses" && <Catalog title="Status" editingId={editingId} onEdit={setEditingId} items={module.statuses.map((s) => ({ id: s.id, title: s.name, subtitle: `${s.kanbanColumn} · ${module.departments.find((department) => department.id === s.departmentId)?.name ?? "Todos os setores"} · ordem ${s.displayOrder}${s.isFinal ? " · final" : ""}`, active: s.active }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskStatus", "Status salvo.")}><input name="name" required placeholder="Nome" defaultValue={status?.name} /><select name="departmentId" defaultValue={status?.departmentId ?? ""}><option value="">Todos os setores</option>{module.departments.filter((department) => department.active).map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select><input name="kanbanColumn" required placeholder="Coluna Kanban" defaultValue={status?.kanbanColumn} /><input name="displayOrder" type="number" required placeholder="Ordem" defaultValue={status?.displayOrder} /><label><input name="isInitial" type="checkbox" defaultChecked={status?.isInitial} /> Inicial</label><label><input name="isFinal" type="checkbox" defaultChecked={status?.isFinal} /> Final</label><label><input name="acceptsNewTasks" type="checkbox" defaultChecked={status?.acceptsNewTasks ?? true} /> Recebe novas</label><label><input name="manualMovement" type="checkbox" defaultChecked={status?.manualMovement ?? true} /> Movimento manual</label><label><input name="requiresJustification" type="checkbox" defaultChecked={status?.requiresJustification} /> Exige justificativa</label><ActiveField value={status?.active} /><FormButtons editing={!!status} busy={busy} onCancel={() => setEditingId(null)} label="status" /></form></Catalog>}
    {tab === "kanban" && <Catalog title="Kanban" editingId={editingId} onEdit={setEditingId} items={module.statuses.map((s) => ({ id: s.id, title: s.kanbanColumn || s.name, subtitle: `${module.departments.find((department) => department.id === s.departmentId)?.name ?? "Todos os setores"} · ${s.name} · posição ${s.displayOrder}`, active: s.active }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskStatus", "Coluna do Kanban salva.")}><input name="name" required readOnly value={status?.name ?? ""} placeholder="Selecione um status para editar" /><select name="departmentId" defaultValue={status?.departmentId ?? ""}><option value="">Todos os setores</option>{module.departments.filter((department) => department.active).map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select><input name="kanbanColumn" required placeholder="Título da coluna" defaultValue={status?.kanbanColumn} /><input name="displayOrder" type="number" required placeholder="Posição" defaultValue={status?.displayOrder} /><label><input name="isInitial" type="checkbox" defaultChecked={status?.isInitial} /> Primeira coluna</label><label><input name="isFinal" type="checkbox" defaultChecked={status?.isFinal} /> Coluna final</label><label><input name="acceptsNewTasks" type="checkbox" defaultChecked={status?.acceptsNewTasks ?? true} /> Recebe novas tarefas</label><label><input name="manualMovement" type="checkbox" defaultChecked={status?.manualMovement ?? true} /> Permite movimentação</label><label><input name="requiresJustification" type="checkbox" defaultChecked={status?.requiresJustification} /> Exige justificativa</label><ActiveField value={status?.active} /><FormButtons editing={!!status} busy={busy} onCancel={() => setEditingId(null)} label="coluna" /></form></Catalog>}
        {tab === "types" && <Catalog title="Tipos de tarefa" editingId={editingId} onEdit={setEditingId} items={module.types.map((t) => ({ id: t.id, title: t.name, subtitle: t.description, active: t.active }))}><form key={editingId ?? "new"} className="catalog-complex-form" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await operate({ action: "saveTaskType", id: editingId, name: f.get("name"), catalogDescription: f.get("catalogDescription"), departmentIds: f.getAll("departmentIds"), initialStatusId: f.get("initialStatusId"), allowedStatusIds: f.getAll("allowedStatusIds"), defaultPriorityId: f.get("defaultPriorityId") || null, defaultSlaPolicyId: f.get("defaultSlaPolicyId") || null, active: f.has("active") }, "Tipo salvo.")) setEditingId(null); }}><input name="name" required placeholder="Nome" defaultValue={type?.name} /><input name="catalogDescription" placeholder="Descrição" defaultValue={type?.description} /><select name="defaultPriorityId" defaultValue={type?.defaultPriorityId ?? ""}><option value="">Prioridade padrão</option>{module.priorities.filter((p) => p.active).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select><select name="defaultSlaPolicyId" defaultValue={type?.defaultSlaPolicyId ?? ""}><option value="">SLA padrão</option>{module.slaPolicies.filter((s) => s.active).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select><select name="initialStatusId" required defaultValue={type?.initialStatusId ?? ""}><option value="">Status inicial</option>{module.statuses.filter((s) => s.active).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select><CheckGroup legend="Setores disponíveis" name="departmentIds" values={module.departments.filter((d) => d.active).map((d) => ({ id: d.id, label: d.name }))} selected={type?.departmentIds ?? []} /><CheckGroup legend="Status permitidos" name="allowedStatusIds" values={module.statuses.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name }))} selected={type?.allowedStatusIds ?? []} /><ActiveField value={type?.active} /><FormButtons editing={!!type} busy={busy} onCancel={() => setEditingId(null)} label="tipo" /></form></Catalog>}
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
          <label className="catalog-field"><span>Telefone</span><input name="phone" type="tel" placeholder="(00) 00000-0000" autoComplete="tel" /></label>
          <label className="catalog-field"><span>Cargo</span><input name="jobTitle" placeholder="Ex.: Analista de suporte" autoComplete="organization-title" /></label>
          <CheckGroup legend="Setores" name="departmentIds" values={module.departments.filter((d) => d.active).map((d) => ({ id: d.id, label: d.name }))} selected={[]} />
          <CheckGroup legend="Coordena (selecione também em Setores)" name="coordinatorDepartmentIds" values={module.departments.filter((d) => d.active).map((d) => ({ id: d.id, label: d.name }))} selected={[]} />
          <ActiveField />
          <span className="catalog-form-actions"><button disabled={busy} type="submit"><UserRound size={15} /> Cadastrar colaborador</button></span>
        </form>
      </div>
      <div className="catalog-records-heading"><div><h2>Colaboradores cadastrados</h2><p>Usuários inativos permanecem no histórico, mas não recebem novas tarefas.</p></div><b>{module.collaborators.length} registro(s)</b></div>
      <div className="collaborator-list">{module.collaborators.map((c) => <form key={c.id} onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await operate({ action: "saveTaskCollaborator", userId: c.id, phone: f.get("phone"), jobTitle: f.get("jobTitle"), departmentIds: f.getAll("departmentIds"), coordinatorDepartmentIds: f.getAll("coordinatorDepartmentIds"), active: f.has("active") }, "Colaborador atualizado."); }}><div className="collaborator-identity"><CollaboratorAvatar collaborator={c} /><span><b>{c.name}</b><small>{c.email}</small></span></div><input name="phone" defaultValue={c.phone} placeholder="Telefone" aria-label={`Telefone de ${c.name}`} /><input name="jobTitle" defaultValue={c.jobTitle} placeholder="Cargo" aria-label={`Cargo de ${c.name}`} /><CheckGroup legend="Setores" name="departmentIds" values={module.departments.map((d) => ({ id: d.id, label: d.name }))} selected={c.departmentIds} /><CheckGroup legend="Coordena" name="coordinatorDepartmentIds" values={module.departments.map((d) => ({ id: d.id, label: d.name }))} selected={c.coordinatorDepartmentIds} /><ActiveField value={c.active} /><button disabled={busy}>Salvar alterações</button></form>)}</div>
    </div>}
  </section></div></TaskCatalogActions.Provider>;
}

function LegacyCatalog({ title, items, editingId, onEdit, children }: { title: string; items: Array<{ id: string; title: string; subtitle: string; active: boolean; color?: string }>; editingId: string | null; onEdit: (id: string) => void; children: React.ReactNode }) {
  const actions = useContext(TaskCatalogActions);
  const catalog = ({ "Setores": "departments", "Prioridades": "priorities", "Status": "statuses", "Kanban": "statuses", "Tipos de tarefa": "types", "Políticas de SLA": "sla" } as Record<string, string>)[title];
  return <div className="catalog-page-content" aria-label={title}><div className="catalog-form"><div className="catalog-card-heading"><span>{editingId ? "EDITANDO REGISTRO" : "NOVO REGISTRO"}</span><h2>{editingId ? `Editar ${title.toLocaleLowerCase("pt-BR")}` : `Cadastrar ${title.toLocaleLowerCase("pt-BR")}`}</h2><p>Cadastros inativos deixam de aparecer imediatamente nas seleções operacionais.</p></div>{children}</div><div className="catalog-records-heading"><div><h2>{title} cadastrados</h2><p>Itens inativos permanecem aqui para edição, reativação ou exclusão definitiva.</p></div><b>{items.filter((item) => item.active).length} ativo(s) de {items.length}</b></div><div className="catalog-list">{items.map((item) => <article className={editingId === item.id ? "selected" : ""} key={item.id}><i style={{ background: item.color ?? (item.active ? "#22c55e" : "#94a3b8") }} /><span><b>{item.title}</b><small>{item.subtitle || "Sem descrição"}</small></span><em className={item.active ? "active" : "inactive"}>{item.active ? "Ativo" : "Inativo"}</em><button type="button" onClick={() => onEdit(item.id)}>Editar</button>{actions && catalog && <button type="button" className="catalog-delete-action" onClick={() => void actions.remove(catalog, item.id, item.title)}><Trash2 size={14} /> Excluir</button>}</article>)}</div></div>;
}

function Catalog({ title, items, editingId, onEdit, children }: { title: string; items: Array<{ id: string; title: string; subtitle: string; active: boolean; color?: string }>; editingId: string | null | undefined; onEdit: (id: string | null | undefined) => void; children: React.ReactNode }) {
  const actions = useContext(TaskCatalogActions);
  const catalog = title === "Setores" ? "departments" : title === "Prioridades" ? "priorities" : title === "Status" || title === "Kanban" ? "statuses" : title === "Tipos de tarefa" ? "types" : title === "Políticas de SLA" ? "sla" : "";
  const editorOpen = editingId !== null;
  return <div className="catalog-page-content catalog-list-page" aria-label={title}>
    <div className="catalog-records-heading">
      <div><h2>{title} cadastrados</h2><p>Itens inativos permanecem disponíveis para edição, reativação ou exclusão definitiva.</p></div>
      <span><b>{items.filter((item) => item.active).length} ativo(s) de {items.length}</b><button className="primary-button" type="button" onClick={() => onEdit(undefined)}><Plus size={16} /> Novo cadastro</button></span>
    </div>
    <div className="catalog-list">
      {items.filter((item) => item.active).length === 0 && <p className="catalog-empty">Nenhum cadastro ativo encontrado.</p>}
      {items.filter((item) => item.active).map((item) => <article className={editingId === item.id ? "selected" : ""} key={item.id}>
        <i style={{ background: item.color ?? (item.active ? "#22c55e" : "#94a3b8") }} />
        <span><b>{item.title}</b><small>{item.subtitle || "Sem descrição"}</small></span>
        <em className={item.active ? "active" : "inactive"}>{item.active ? "Ativo" : "Inativo"}</em>
        {actions && catalog && <button type="button" className={`catalog-icon-button ${item.active ? "lock" : "unlock"}`} onClick={() => void actions.toggle(catalog, item.id, item.title)} aria-label={item.active ? `Bloquear ${item.title}` : `Reativar ${item.title}`} title={item.active ? "Bloquear temporariamente" : "Reativar cadastro"}><Power size={14} /></button>}
        <button type="button" onClick={() => onEdit(item.id)}>Editar</button>
        {actions && catalog && <button type="button" className="catalog-delete-action" onClick={() => void actions.remove(catalog, item.id, item.title)}><Trash2 size={14} /> Excluir</button>}
      </article>)}
    </div>
    {editorOpen && <div className="modal-backdrop catalog-editor-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onEdit(null)}>
      <div className="modal task-catalog-modal" role="dialog" aria-modal="true" aria-label={editingId ? `Editar ${title}` : `Novo ${title}`}>
        <div className="modal-head"><div><span className="eyebrow">CADASTROS · TAREFAS</span><h2>{editingId ? `Editar ${title}` : `Novo ${title}`}</h2><p>As alterações ficam disponíveis imediatamente nas seleções do sistema.</p></div><button className="icon-button" type="button" onClick={() => onEdit(null)} aria-label="Fechar"><X size={20} /></button></div>
        <div className="catalog-form">{children}</div>
      </div>
    </div>}
  </div>;
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
    <form key={editingId ?? "new"} className="catalog-complex-form" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const businessDays = Number(form.get("businessDays"));
      if (!Number.isInteger(businessDays) || businessDays < 1) return;
      const saved = await operate({
        action: "saveTaskSla",
        id: editingId,
        name: `${businessDays} dia${businessDays === 1 ? "" : "s"} útil${businessDays === 1 ? "" : "eis"}`,
        departmentId: defaultDepartmentId,
        typeId: null,
        priorityId: null,
        firstResponseMinutes: 0,
        serviceStartMinutes: 0,
        completionMinutes: businessDays * 480,
        businessDays: [1, 2, 3, 4, 5],
        businessStart: "08:00",
        businessEnd: "18:00",
        alertBeforeMinutes: 0,
        escalationMinutes: 0,
        pauseStatusIds: [],
        recalculateSla: true,
        active: true,
      }, "Prazo de SLA salvo.");
      if (saved) setEditingId(null);
    }}>
      <label className="wide">Prazo para conclusão (dias úteis) *
        <input name="businessDays" type="number" min="1" step="1" required defaultValue={initialDays} />
        <small>A contagem começa no momento da criação da tarefa e considera apenas dias úteis.</small>
      </label>
      <FormButtons editing={!!sla} busy={busy} onCancel={() => setEditingId(null)} label="prazo" />
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
  return <div className="task-overlay"><div className="task-modal task-created-modal"><div className="task-modal-body"><span className="task-created-icon"><CheckCircle2 size={34} /></span><span className="eyebrow">TAREFA CADASTRADA</span><h2>Criada com sucesso</h2><p>Compartilhe o protocolo abaixo para acompanhar a solicitação.</p><button className="task-created-protocol" onClick={async () => { await navigator.clipboard.writeText(protocol); setCopied(true); }}><span>{protocol}</span><small>{copied ? "Copiado!" : "Clique para copiar"}</small><Clipboard size={18} /></button><button className="primary-button" onClick={onClose}>Continuar</button></div></div></div>;
}

function Overlay({ title, eyebrow = "TAREFAS", subtitle, onClose, wide, side = false, detail = false, headerActions, children }: { title: string; eyebrow?: string; subtitle?: string; onClose: () => void; wide?: boolean; side?: boolean; detail?: boolean; headerActions?: React.ReactNode; children: React.ReactNode }) {
  return <div className={`task-overlay ${side ? "task-side-overlay" : ""} ${detail ? "task-detail-overlay" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className={`task-modal ${wide ? "wide" : ""} ${side ? "task-side-panel" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{headerActions && <div className="task-overlay-header-actions">{headerActions}</div>}<button onClick={onClose} aria-label="Fechar"><X size={19} /></button></header><div className="task-modal-body">{children}</div></div></div>;
}
