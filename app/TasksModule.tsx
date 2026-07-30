"use client";

import {
  Bell, Check, ChevronRight, CircleDot, Clock3, Columns3,
  History, List, MessageSquareText, Paperclip, Plus, Search, Send, Upload,
  UserRound, UsersRound, X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

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
export type CatalogSection = "departments" | "types" | "priorities" | "statuses" | "sla" | "people";

type CorporateTask = {
  id: string; number: number; protocol: string; title: string; description: string;
  typeId: string; typeName: string; priorityId: string; priorityName: string; priorityColor: string;
  statusId: string; statusName: string; slaPolicyId: string | null; sourceDepartmentId: string; currentDepartmentId: string;
  departmentName: string; creatorUserId: string; creatorName: string; assigneeUserId: string | null;
  assigneeName: string; customerId: string | null; customerCode: string; customerName: string;
  externalLink: string; internalNotes: string; dueAt: string | null; slaDueAt: string | null;
  slaState: string; completedAt: string | null; cancelled: boolean; version: number;
  createdAt: string; updatedAt: string; comments: TaskComment[]; history: TaskHistory[];
  attachments: Array<{ id: string; fileName: string; url: string; createdAt: string }>;
};
type Department = { id: string; name: string; description: string; active: boolean; requiresAssigneeOnTransfer: boolean; coordinatorUserIds: string[] };
type Priority = { id: string; name: string; severityOrder: number; color: string; defaultDueMinutes: number | null; active: boolean };
type Status = { id: string; name: string; departmentId: string | null; displayOrder: number; kanbanColumn: string; isInitial: boolean; isFinal: boolean; acceptsNewTasks: boolean; manualMovement: boolean; requiresJustification: boolean; active: boolean };
type TaskType = { id: string; name: string; description: string; defaultPriorityId: string | null; defaultSlaPolicyId: string | null; initialStatusId: string; departmentIds: string[]; allowedStatusIds: string[]; active: boolean };
type Sla = { id: string; name: string; departmentId: string; taskTypeId: string | null; priorityId: string | null; firstResponseMinutes: number; serviceStartMinutes: number; completionMinutes: number; businessDays: number[]; businessStart: string; businessEnd: string; alertBeforeMinutes: number; escalationMinutes: number; recalculateOnTransfer: boolean; pauseStatusIds: string[]; active: boolean };
type Collaborator = { id: string; name: string; email: string; phone: string; jobTitle: string; active: boolean; departmentIds: string[]; coordinatorDepartmentIds: string[] };
type Notification = { id: string; taskId: string; taskNumber: number; eventType: string; message: string; read: boolean; createdAt: string };
type TaskComment = { id: string; authorUserId: string; authorName: string; body: string; internal: boolean; createdAt: string };
type TaskHistory = { id: string; eventType: string; summary: string; actorName: string; previousValue: string; newValue: string; source: string; justification: string; createdAt: string };

type Props = {
  module: TaskModuleData;
  customers: Array<{ id: string; trade_name: string }>;
  user: { displayName: string };
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  capabilities: string[];
  busy: boolean;
  operate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>;
  uploadAttachments: (taskId: string, files: File[]) => Promise<boolean>;
};

const dt = (value?: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "—";

export default function TasksModule({ module, customers, user, canCreate, canEdit, canManage, capabilities, busy, operate, uploadAttachments }: Props) {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [selected, setSelected] = useState<CorporateTask | null>(null);
  const [creating, setCreating] = useState(false);
  const has = (capability: string) => canManage || capabilities.includes(capability);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return module.tasks.filter((task) => {
      const text = `#${task.number} ${task.protocol} ${task.title} ${task.description} ${task.customerName}`.toLocaleLowerCase("pt-BR");
      return (!needle || text.includes(needle))
        && (!department || task.currentDepartmentId === department)
        && (!priority || task.priorityId === priority)
        && (!assignee || task.assigneeUserId === assignee)
        && (!onlyMine || task.assigneeName === user.displayName || task.creatorName === user.displayName);
    });
  }, [module.tasks, query, department, priority, assignee, onlyMine, user.displayName]);

  const move = async (task: CorporateTask, statusId: string) => {
    if (!canEdit || !has("changeStatus") || task.statusId === statusId) return;
    const target = module.statuses.find((status) => status.id === statusId);
    const justification = target?.requiresJustification ? window.prompt("Justificativa obrigatória:") : "";
    if (target?.requiresJustification && !justification) return;
    await operate({ action: "changeTaskStatus", taskId: task.id, statusId, justification, version: task.version }, `Tarefa movida para ${target?.name}.`);
  };

  return <div className="tasks-module">
    <div className="tasks-heading">
      <div><span className="eyebrow">OPERAÇÃO CORPORATIVA</span><h1>Tarefas</h1><p>Demandas internas, responsáveis, setores e SLA em um fluxo auditável.</p></div>
      {canCreate && <button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Nova tarefa</button>}
    </div>
    <div className="tasks-kpis">
      <div><span>Em aberto</span><strong>{module.tasks.filter((t) => !t.completedAt).length}</strong><small>tarefas ativas</small></div>
      <div><span>Sem responsável</span><strong>{module.tasks.filter((t) => !t.assigneeUserId).length}</strong><small>na fila dos setores</small></div>
      <div><span>SLA em risco</span><strong>{module.tasks.filter((t) => /Vencido|Próximo/.test(t.slaState)).length}</strong><small>exigem atenção</small></div>
      <div><span>Não lidas</span><strong>{module.notifications.filter((n) => !n.read).length}</strong><small>notificações internas</small></div>
    </div>
    <div className="tasks-toolbar">
      <div className="task-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Código, protocolo, título, cliente..." /></div>
      <select value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">Todos os setores</option>{module.departments.filter((d) => d.active).map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select>
      <select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Prioridades</option>{module.priorities.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select>
      <select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Responsáveis</option>{module.collaborators.filter((c) => c.active).map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
      <label className="mine-filter"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Minhas</label>
      <div className="tasks-view-switch">
        <button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}><Columns3 size={16} /> Kanban</button>
        <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={16} /> Lista</button>
      </div>
    </div>

    {view === "kanban" && <Kanban tasks={filtered} statuses={module.statuses} onOpen={setSelected} onMove={move} />}
    {view === "list" && <TaskList tasks={filtered} onOpen={setSelected} />}

    {creating && <CreateTaskModal module={module} customers={customers} creator={user.displayName} busy={busy} onClose={() => setCreating(false)} onSubmit={async (payload, files) => {
      const result = await operate({ action: "createTask", ...payload }, "Tarefa criada, protocolo e SLA calculados.");
      if (!result) return;
      setCreating(false);
      if (result.id && files.length > 0) await uploadAttachments(result.id, files);
    }} />}
    {selected && <TaskDetail task={module.tasks.find((t) => t.id === selected.id) ?? selected} module={module} canEdit={canEdit} has={has} busy={busy} onClose={() => setSelected(null)} operate={operate} uploadAttachments={uploadAttachments} />}
  </div>;
}

function Kanban({ tasks, statuses, onOpen, onMove }: { tasks: CorporateTask[]; statuses: Status[]; onOpen: (task: CorporateTask) => void; onMove: (task: CorporateTask, statusId: string) => void }) {
  return <div className="task-board">{statuses.filter((s) => s.active).sort((a, b) => a.displayOrder - b.displayOrder).map((status) => {
    const column = tasks.filter((task) => task.statusId === status.id);
    return <section className="task-column" key={status.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
      const task = tasks.find((entry) => entry.id === e.dataTransfer.getData("taskId"));
      if (task) void onMove(task, status.id);
    }}>
      <header><span><CircleDot size={14} />{status.kanbanColumn || status.name}</span><b>{column.length}</b></header>
      <div>{column.map((task) => <button draggable className={`task-card ${task.slaState === "Vencido" ? "overdue" : ""}`} key={task.id}
        onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)} onClick={() => onOpen(task)}>
        <div className="task-card-code"><span>#{task.number}</span><i style={{ background: task.priorityColor }} />{task.priorityName}</div>
        <strong>{task.title}</strong>
        <p>{task.customerName || task.description || "Sem cliente relacionado"}</p>
        <div className={`sla-chip ${task.slaState.toLowerCase().replaceAll(" ", "-")}`}><Clock3 size={12} /> {task.slaState} · {dt(task.slaDueAt)}</div>
        <footer><span><UsersRound size={13} /> {task.departmentName}</span><span><UserRound size={13} /> {task.assigneeName}</span></footer>
      </button>)}</div>
    </section>;
  })}</div>;
}

function TaskList({ tasks, onOpen }: { tasks: CorporateTask[]; onOpen: (task: CorporateTask) => void }) {
  return <div className="task-table"><div className="task-table-row head"><span>Código / tarefa</span><span>Tipo</span><span>Setor</span><span>Prioridade</span><span>Status</span><span>Responsável</span><span>Prazo / SLA</span><span>Atualização</span></div>
    {tasks.length === 0 ? <div className="task-empty">Nenhuma tarefa encontrada com estes filtros.</div> : tasks.map((task) => <button className="task-table-row" onClick={() => onOpen(task)} key={task.id}>
      <span><b>#{task.number} · {task.title}</b><small>{task.protocol || task.customerName || "Sem protocolo"}</small></span>
      <span>{task.typeName}</span><span>{task.departmentName}</span>
      <span><i className="priority-dot" style={{ background: task.priorityColor }} />{task.priorityName}</span>
      <span>{task.statusName}</span><span>{task.assigneeName}</span>
      <span><b className={task.slaState === "Vencido" ? "danger-text" : ""}>{task.slaState}</b><small>{dt(task.slaDueAt)}</small></span>
      <span>{dt(task.updatedAt)}<ChevronRight size={15} /></span>
    </button>)}</div>;
}

function CreateTaskModal({ module, customers, creator, busy, onClose, onSubmit }: { module: TaskModuleData; customers: Array<{ id: string; trade_name: string }>; creator: string; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>, files: File[]) => void }) {
  const [departmentId, setDepartmentId] = useState(
    module.types.find((type) => type.active)?.departmentIds[0]
      ?? module.departments.find((department) => department.active)?.id
      ?? "");
  const validTypes = module.types.filter((t) => t.active && t.departmentIds.includes(departmentId));
  const assignees = module.collaborators.filter((c) => c.active && c.departmentIds.includes(departmentId));
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const type = validTypes.find((entry) => entry.id === f.get("typeId"));
    const files = f.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    onSubmit({
      title: f.get("title"), description: f.get("description"),
      typeId: f.get("typeId"), priorityId: f.get("priorityId") || type?.defaultPriorityId,
      statusId: f.get("statusId") || type?.initialStatusId, sourceDepartmentId: departmentId,
      currentDepartmentId: departmentId, assigneeUserId: f.get("assigneeUserId") || null,
      customerId: f.get("customerId") || null, customerCode: f.get("customerCode"),
      externalLink: f.get("externalLink"), internalNotes: f.get("internalNotes"),
      dueAt: f.get("dueAt") ? new Date(String(f.get("dueAt"))).toISOString() : null,
      slaPolicyId: f.get("slaPolicyId") || type?.defaultSlaPolicyId,
    }, files);
  };
  return <Overlay title="✅ Nova Tarefa" onClose={onClose}><form className="task-form" onSubmit={submit}>
    <label className="wide">Título *<input name="title" required placeholder="Resuma a demanda em uma frase" /></label>
    <div className="task-auto-protocol"><span>Protocolo</span><b>Gerado automaticamente ao criar</b></div><label>ID do cliente<input name="customerCode" placeholder="000000" /></label>
    <label className="wide">Link<input name="externalLink" type="url" placeholder="https://..." /></label>
    <label>Setor de destino *<select required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>{module.departments.filter((d) => d.active).map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select></label>
    <label>Tipo *<select name="typeId" required><option value="">Selecionar...</option>{validTypes.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
    <label>Prioridade<select name="priorityId"><option value="">Padrão do tipo</option>{module.priorities.filter((p) => p.active).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    <label>SLA<select name="slaPolicyId"><option value="">Automático</option>{module.slaPolicies.filter((s) => s.active && s.departmentId === departmentId).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
    <label>Status inicial<select name="statusId"><option value="">Padrão do tipo</option>{module.statuses.filter((s) => s.active && s.acceptsNewTasks).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
    <label>Criador<input value={creator} disabled /></label>
    <label>Responsável<select name="assigneeUserId"><option value="">Fila compartilhada do setor</option>{assignees.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
    <label>Cliente<select name="customerId"><option value="">Sem cliente</option>{customers.map((c) => <option value={c.id} key={c.id}>{c.trade_name}</option>)}</select></label>
    <label>Prazo previsto<input type="datetime-local" name="dueAt" /></label>
    <label className="wide">Descrição detalhada *<textarea name="description" required rows={4} /></label>
    <label className="wide task-file-picker">Anexos <input name="files" type="file" multiple /><small>Até 10 arquivos por envio, com no máximo 25 MB cada. Os arquivos serão armazenados de forma privada na AWS.</small></label>
    <label className="wide">Observações internas<textarea name="internalNotes" rows={2} /></label>
    <div className="task-form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? "Salvando..." : "Criar tarefa"}</button></div>
  </form></Overlay>;
}

function TaskDetail({ task, module, canEdit, has, busy, onClose, operate, uploadAttachments }: { task: CorporateTask; module: TaskModuleData; canEdit: boolean; has: (cap: string) => boolean; busy: boolean; onClose: () => void; operate: Props["operate"]; uploadAttachments: Props["uploadAttachments"] }) {
  const [comment, setComment] = useState("");
  const [transferDepartment, setTransferDepartment] = useState(task.currentDepartmentId);
  const [transferAssignee, setTransferAssignee] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const availableAssignees = module.collaborators.filter((c) => c.active && c.departmentIds.includes(transferDepartment));
  return <Overlay title={`#${task.number} — ${task.title}`} onClose={onClose} wide>
    <div className="task-detail-badges">
      <span className="protocol">{task.protocol}</span>
      <span className="department">{task.departmentName}</span>
      <b className="priority" style={{ color: task.priorityColor }}>{task.priorityName}</b>
      <span className={`sla ${task.slaState === "Vencido" ? "overdue" : ""}`}>SLA: {task.slaState}</span>
      <span className="customer">Cliente: {task.customerCode || task.customerName || "—"}</span>
      {task.externalLink && <a href={task.externalLink} target="_blank">↗ Abrir link externo</a>}
    </div>
    <section className="task-description-card"><span>DESCRIÇÃO DA TAREFA</span><p>{task.description}</p></section>
    <div className="task-files-panel">
      <div><h3><Paperclip size={16} /> Anexos</h3><span>{task.attachments?.length ?? 0} arquivo(s)</span></div>
      {(task.attachments?.length ?? 0) > 0
        ? <div className="task-attachments">{task.attachments.map((attachment) => <a href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}><Paperclip size={14} /> {attachment.fileName}</a>)}</div>
        : <p>Nenhum arquivo anexado.</p>}
      {canEdit && <form className="task-file-upload" onSubmit={async (e) => {
        e.preventDefault();
        if (attachmentFiles.length === 0) return;
        if (await uploadAttachments(task.id, attachmentFiles)) {
          setAttachmentFiles([]);
          setFileInputKey((value) => value + 1);
        }
      }}>
        <input key={fileInputKey} type="file" multiple onChange={(e) => setAttachmentFiles(Array.from(e.target.files ?? []))} aria-label="Selecionar arquivos para anexar" />
        <button disabled={busy || attachmentFiles.length === 0}><Upload size={15} /> {busy ? "Enviando..." : "Adicionar arquivos"}</button>
      </form>}
    </div>
    <section className="task-actions-panel">
      <header><div><span>AÇÕES DA TAREFA</span><h3>Atualizar e comunicar</h3></div><p>Use os controles abaixo para alterar o fluxo ou solicitar uma ação.</p></header>
      <div className="task-action-fields">
        {canEdit && has("changeStatus") && <label className="status-control"><span>Status</span><select value={task.statusId} onChange={async (e) => {
          const target = module.statuses.find((s) => s.id === e.target.value);
          const justification = target?.requiresJustification ? window.prompt("Justificativa obrigatória:") : "";
          if (!target?.requiresJustification || justification) await operate({ action: "changeTaskStatus", taskId: task.id, statusId: e.target.value, justification, version: task.version }, "Status atualizado.");
        }}>{module.statuses.filter((s) => task.statusId === s.id || (s.active && s.manualMovement)).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
        {canEdit && has("changePriority") && <label className="priority-control"><span>Prioridade</span><select value={task.priorityId} onChange={(e) => void operate({ action: "changeTaskPriority", taskId: task.id, priorityId: e.target.value, version: task.version }, "Prioridade atualizada.")}>{module.priorities.filter((p) => p.active).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}
        {canEdit && has("changeSla") && <label className="sla-control"><span>Política de SLA</span><select value={task.slaPolicyId ?? ""} onChange={(e) => void operate({ action: "changeTaskSla", taskId: task.id, slaPolicyId: e.target.value || null, version: task.version }, "SLA recalculado.")}><option value="">Sem SLA</option>{module.slaPolicies.filter((s) => s.active && s.departmentId === task.currentDepartmentId).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
      </div>
      <div className="task-action-buttons">
        {canEdit && has("assume") && !task.assigneeUserId && <button className="assume-action" disabled={busy} onClick={() => operate({ action: "assignTask", taskId: task.id, version: task.version }, "Tarefa assumida.")}><Check size={15} /> Assumir tarefa</button>}
        {(has("notifyClient")) && <button className="notify-action" onClick={() => { const message = window.prompt("Mensagem ao cliente:"); if (message) void operate({ action: "communicateWithClient", taskId: task.id, clientAction: "notifyClient", channel: "E-mail", message }, "Comunicação registrada; integração de envio pendente."); }}><Send size={15} /> Notificar cliente</button>}
        <button className="contact-action" onClick={() => { const message = window.prompt("Orientação para o responsável:"); if (message) void operate({ action: "communicateWithClient", taskId: task.id, clientAction: "requestContact", channel: "Interno", message }, "Solicitação enviada ao responsável."); }}><Bell size={15} /> Solicitar contato</button>
      </div>
    </section>
    {canEdit && has("forward") && <div className="task-transfer"><h3>Encaminhar para outro setor</h3><select value={transferDepartment} onChange={(e) => { setTransferDepartment(e.target.value); setTransferAssignee(""); }}>{module.departments.filter((d) => d.active).map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select><select value={transferAssignee} onChange={(e) => setTransferAssignee(e.target.value)}><option value="">Fila compartilhada</option>{availableAssignees.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select><button onClick={() => { const reason = window.prompt("Motivo do encaminhamento:"); if (reason) void operate({ action: "transferTask", taskId: task.id, departmentId: transferDepartment, assigneeUserId: transferAssignee || null, reason, recalculateSla: true, version: task.version }, "Tarefa encaminhada e SLA revisado."); }}>Encaminhar</button></div>}
    <div className="task-detail-grid">
      <section className="task-conversation-card"><header><h3><MessageSquareText size={17} /> Comentários</h3><span>{task.comments.length}</span></header><div className="task-comments">{task.comments.length === 0 ? <p className="task-empty-message">Nenhum comentário registrado.</p> : task.comments.map((c) => <article key={c.id}><b>{c.authorName}</b><time>{dt(c.createdAt)}</time><p>{c.body}</p></article>)}</div>
        {canEdit && <form onSubmit={async (e) => { e.preventDefault(); if (!comment.trim()) return; if (await operate({ action: "addTaskComment", taskId: task.id, body: comment }, "Comentário registrado.")) setComment(""); }}><label htmlFor="task-comment">Adicionar comentário</label><textarea id="task-comment" rows={5} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Descreva a atualização, orientação ou informação relevante para esta tarefa..." /><footer><small>{comment.length} caracteres</small><button disabled={busy || !comment.trim()}><MessageSquareText size={15} /> Publicar comentário</button></footer></form>}</section>
      <section className="task-history-card"><header><h3><History size={17} /> Histórico</h3><span>{task.history.length}</span></header><div className="task-history">{task.history.map((h) => <article key={h.id}><i /><div><b>{h.summary}</b><small>{h.actorName} · {dt(h.createdAt)}</small>{h.justification && <p>Justificativa: {h.justification}</p>}</div></article>)}</div></section>
    </div>
  </Overlay>;
}

export function CatalogsModule({ module, section, onSection, canManage, busy, operate }: { module: TaskModuleData; section: CatalogSection; onSection: (section: CatalogSection) => void; canManage: boolean; busy: boolean; operate: Props["operate"] }) {
  const pages: Record<CatalogSection, { title: string; description: string }> = {
    departments: { title: "Setores", description: "Organize as áreas da empresa, coordenadores e regras de encaminhamento." },
    types: { title: "Tipos de tarefa", description: "Configure os tipos disponíveis, setores responsáveis, fluxo, prioridade e SLA padrão." },
    priorities: { title: "Prioridades", description: "Defina a criticidade, identificação visual e prazo padrão das demandas." },
    statuses: { title: "Status", description: "Monte as etapas e colunas do Kanban utilizadas nos fluxos de tarefas." },
    sla: { title: "Políticas de SLA", description: "Configure prazos, calendário útil, pausas, alertas e regras de escalonamento." },
    people: { title: "Colaboradores", description: "Gerencie cargo, contato, situação, setores e responsabilidades de coordenação." },
  };
  const page = pages[section];
  return <div className="catalogs-module">
    <div className="catalog-page-heading">
      <div><span className="eyebrow">CADASTROS DO SISTEMA</span><h1>{page.title}</h1><p>{page.description}</p></div>
      <span className="catalog-page-context">Cadastros <ChevronRight size={13} /> {page.title}</span>
    </div>
    {!canManage && <div className="readonly-note">Seu grupo possui acesso de consulta. Para alterar cadastros, habilite “Administrar” na tela Cadastros.</div>}
    <TaskSettings key={section} module={module} tab={section} onTab={onSection} canManage={canManage} busy={busy} operate={operate} />
  </div>;
}

function TaskSettings({ module, tab, onTab, canManage, busy, operate }: { module: TaskModuleData; tab: CatalogSection; onTab: (section: CatalogSection) => void; canManage: boolean; busy: boolean; operate: Props["operate"] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const sla = module.slaPolicies.find((item) => item.id === editingId);
  void onTab;
  return <div className={`task-settings ${canManage ? "" : "readonly"}`}><section>
    {tab === "departments" && <Catalog title="Setores" editingId={editingId} onEdit={setEditingId} items={module.departments.map((d) => ({ id: d.id, title: d.name, subtitle: d.description, active: d.active }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskDepartment", "Setor salvo.")}><input name="name" required placeholder="Nome do setor" defaultValue={department?.name} /><input name="catalogDescription" placeholder="Descrição" defaultValue={department?.description} /><label><input type="checkbox" name="requiresAssigneeOnTransfer" defaultChecked={department?.requiresAssigneeOnTransfer} /> Exigir responsável</label><CheckGroup legend="Coordenadores" name="coordinatorUserIds" values={module.collaborators.map((c) => ({ id: c.id, label: c.name }))} selected={department?.coordinatorUserIds ?? []} /><ActiveField value={department?.active} /><FormButtons editing={!!department} busy={busy} onCancel={() => setEditingId(null)} label="setor" /></form></Catalog>}
    {tab === "priorities" && <Catalog title="Prioridades" editingId={editingId} onEdit={setEditingId} items={module.priorities.map((p) => ({ id: p.id, title: p.name, subtitle: `Ordem ${p.severityOrder} · prazo ${p.defaultDueMinutes ?? "—"} min`, active: p.active, color: p.color }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskPriority", "Prioridade salva.")}><input name="name" required placeholder="Nome" defaultValue={priority?.name} /><input name="severityOrder" required type="number" placeholder="Ordem" defaultValue={priority?.severityOrder} /><input name="color" type="color" defaultValue={priority?.color ?? "#2563eb"} /><input name="defaultDueMinutes" type="number" placeholder="Prazo padrão (min)" defaultValue={priority?.defaultDueMinutes ?? ""} /><ActiveField value={priority?.active} /><FormButtons editing={!!priority} busy={busy} onCancel={() => setEditingId(null)} label="prioridade" /></form></Catalog>}
    {tab === "statuses" && <Catalog title="Status e colunas do Kanban" editingId={editingId} onEdit={setEditingId} items={module.statuses.map((s) => ({ id: s.id, title: s.name, subtitle: `${s.kanbanColumn} · ordem ${s.displayOrder}${s.isFinal ? " · final" : ""}`, active: s.active }))}><form key={editingId ?? "new"} onSubmit={submit("saveTaskStatus", "Status salvo.")}><input name="name" required placeholder="Nome" defaultValue={status?.name} /><input name="kanbanColumn" required placeholder="Coluna Kanban" defaultValue={status?.kanbanColumn} /><input name="displayOrder" type="number" required placeholder="Ordem" defaultValue={status?.displayOrder} /><label><input name="isInitial" type="checkbox" defaultChecked={status?.isInitial} /> Inicial</label><label><input name="isFinal" type="checkbox" defaultChecked={status?.isFinal} /> Final</label><label><input name="acceptsNewTasks" type="checkbox" defaultChecked={status?.acceptsNewTasks ?? true} /> Recebe novas</label><label><input name="manualMovement" type="checkbox" defaultChecked={status?.manualMovement ?? true} /> Movimento manual</label><label><input name="requiresJustification" type="checkbox" defaultChecked={status?.requiresJustification} /> Exige justificativa</label><ActiveField value={status?.active} /><FormButtons editing={!!status} busy={busy} onCancel={() => setEditingId(null)} label="status" /></form></Catalog>}
    {tab === "types" && <Catalog title="Tipos de tarefa" editingId={editingId} onEdit={setEditingId} items={module.types.map((t) => ({ id: t.id, title: t.name, subtitle: t.description, active: t.active }))}><form key={editingId ?? "new"} className="catalog-complex-form" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await operate({ action: "saveTaskType", id: editingId, name: f.get("name"), catalogDescription: f.get("catalogDescription"), departmentIds: f.getAll("departmentIds"), initialStatusId: f.get("initialStatusId"), allowedStatusIds: f.getAll("allowedStatusIds"), defaultPriorityId: f.get("defaultPriorityId") || null, defaultSlaPolicyId: f.get("defaultSlaPolicyId") || null, active: f.has("active") }, "Tipo salvo.")) setEditingId(null); }}><input name="name" required placeholder="Nome" defaultValue={type?.name} /><input name="catalogDescription" placeholder="Descrição" defaultValue={type?.description} /><select name="defaultPriorityId" defaultValue={type?.defaultPriorityId ?? ""}><option value="">Prioridade padrão</option>{module.priorities.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select><select name="defaultSlaPolicyId" defaultValue={type?.defaultSlaPolicyId ?? ""}><option value="">SLA padrão</option>{module.slaPolicies.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select><select name="initialStatusId" required defaultValue={type?.initialStatusId ?? ""}><option value="">Status inicial</option>{module.statuses.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select><CheckGroup legend="Setores disponíveis" name="departmentIds" values={module.departments.map((d) => ({ id: d.id, label: d.name }))} selected={type?.departmentIds ?? []} /><CheckGroup legend="Status permitidos" name="allowedStatusIds" values={module.statuses.map((s) => ({ id: s.id, label: s.name }))} selected={type?.allowedStatusIds ?? []} /><ActiveField value={type?.active} /><FormButtons editing={!!type} busy={busy} onCancel={() => setEditingId(null)} label="tipo" /></form></Catalog>}
    {tab === "sla" && <Catalog title="Políticas de SLA" editingId={editingId} onEdit={setEditingId} items={module.slaPolicies.map((s) => ({ id: s.id, title: s.name, subtitle: `${s.completionMinutes} min · ${s.businessStart}–${s.businessEnd}`, active: s.active }))}><form key={editingId ?? "new"} className="catalog-complex-form" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await operate({ action: "saveTaskSla", id: editingId, name: f.get("name"), departmentId: f.get("departmentId"), typeId: f.get("taskTypeId") || null, priorityId: f.get("priorityId") || null, firstResponseMinutes: Number(f.get("firstResponseMinutes")), serviceStartMinutes: Number(f.get("serviceStartMinutes")), completionMinutes: Number(f.get("completionMinutes")), businessDays: f.getAll("businessDays").map(Number), businessStart: f.get("businessStart"), businessEnd: f.get("businessEnd"), alertBeforeMinutes: Number(f.get("alertBeforeMinutes")), escalationMinutes: Number(f.get("escalationMinutes")), pauseStatusIds: f.getAll("pauseStatusIds"), recalculateSla: f.has("recalculateSla"), active: f.has("active") }, "Política de SLA salva.")) setEditingId(null); }}><input name="name" required placeholder="Nome da política" defaultValue={sla?.name} /><select name="departmentId" required defaultValue={sla?.departmentId ?? ""}><option value="">Setor</option>{module.departments.map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select><select name="taskTypeId" defaultValue={sla?.taskTypeId ?? ""}><option value="">Todos os tipos</option>{module.types.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select><select name="priorityId" defaultValue={sla?.priorityId ?? ""}><option value="">Todas as prioridades</option>{module.priorities.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select><input name="firstResponseMinutes" type="number" required placeholder="1ª interação (min)" defaultValue={sla?.firstResponseMinutes} /><input name="serviceStartMinutes" type="number" required placeholder="Início (min)" defaultValue={sla?.serviceStartMinutes} /><input name="completionMinutes" type="number" required placeholder="Conclusão (min)" defaultValue={sla?.completionMinutes} /><input name="businessStart" type="time" required defaultValue={sla?.businessStart ?? "08:00"} /><input name="businessEnd" type="time" required defaultValue={sla?.businessEnd ?? "18:00"} /><input name="alertBeforeMinutes" type="number" placeholder="Alerta antes (min)" defaultValue={sla?.alertBeforeMinutes ?? 60} /><input name="escalationMinutes" type="number" placeholder="Escalonamento (min)" defaultValue={sla?.escalationMinutes ?? 0} /><CheckGroup legend="Dias úteis" name="businessDays" values={[{id:"1",label:"Seg"},{id:"2",label:"Ter"},{id:"3",label:"Qua"},{id:"4",label:"Qui"},{id:"5",label:"Sex"},{id:"6",label:"Sáb"},{id:"0",label:"Dom"}]} selected={(sla?.businessDays ?? [1,2,3,4,5]).map(String)} /><CheckGroup legend="Pausar nestes status" name="pauseStatusIds" values={module.statuses.map((s) => ({ id: s.id, label: s.name }))} selected={sla?.pauseStatusIds ?? []} /><label><input name="recalculateSla" type="checkbox" defaultChecked={sla?.recalculateOnTransfer ?? true} /> Recalcular ao encaminhar</label><ActiveField value={sla?.active} /><FormButtons editing={!!sla} busy={busy} onCancel={() => setEditingId(null)} label="SLA" /></form></Catalog>}
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
      <div className="collaborator-list">{module.collaborators.map((c) => <form key={c.id} onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await operate({ action: "saveTaskCollaborator", userId: c.id, phone: f.get("phone"), jobTitle: f.get("jobTitle"), departmentIds: f.getAll("departmentIds"), coordinatorDepartmentIds: f.getAll("coordinatorDepartmentIds"), active: f.has("active") }, "Colaborador atualizado."); }}><div><b>{c.name}</b><small>{c.email}</small></div><input name="phone" defaultValue={c.phone} placeholder="Telefone" aria-label={`Telefone de ${c.name}`} /><input name="jobTitle" defaultValue={c.jobTitle} placeholder="Cargo" aria-label={`Cargo de ${c.name}`} /><CheckGroup legend="Setores" name="departmentIds" values={module.departments.map((d) => ({ id: d.id, label: d.name }))} selected={c.departmentIds} /><CheckGroup legend="Coordena" name="coordinatorDepartmentIds" values={module.departments.map((d) => ({ id: d.id, label: d.name }))} selected={c.coordinatorDepartmentIds} /><ActiveField value={c.active} /><button disabled={busy}>Salvar alterações</button></form>)}</div>
    </div>}
  </section></div>;
}

function Catalog({ title, items, editingId, onEdit, children }: { title: string; items: Array<{ id: string; title: string; subtitle: string; active: boolean; color?: string }>; editingId: string | null; onEdit: (id: string) => void; children: React.ReactNode }) {
  return <div className="catalog-page-content" aria-label={title}><div className="catalog-form"><div className="catalog-card-heading"><span>{editingId ? "EDITANDO REGISTRO" : "NOVO REGISTRO"}</span><h2>{editingId ? `Editar ${title.toLocaleLowerCase("pt-BR")}` : `Cadastrar ${title.toLocaleLowerCase("pt-BR")}`}</h2><p>Preencha os campos abaixo. Os itens marcados como inativos deixam de aparecer em novos registros.</p></div>{children}</div><div className="catalog-records-heading"><div><h2>{title} cadastrados</h2><p>Clique em editar para alterar as informações ou inativar um registro.</p></div><b>{items.length} registro(s)</b></div><div className="catalog-list">{items.map((item) => <article className={editingId === item.id ? "selected" : ""} key={item.id}><i style={{ background: item.color ?? (item.active ? "#22c55e" : "#64748b") }} /><span><b>{item.title}</b><small>{item.subtitle || "Sem descrição"}</small></span><em className={item.active ? "active" : ""}>{item.active ? "Ativo" : "Inativo"}</em><button onClick={() => onEdit(item.id)}>Editar</button></article>)}</div></div>;
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

function Overlay({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="task-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className={`task-modal ${wide ? "wide" : ""}`}><header><h2>{title}</h2><button onClick={onClose} aria-label="Fechar"><X size={19} /></button></header><div className="task-modal-body">{children}</div></div></div>;
}
