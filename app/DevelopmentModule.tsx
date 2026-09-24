"use client";

import { CheckCircle2, ChevronRight, ClipboardList, Code2, Columns3, FileText, GitBranch, List, MessageSquareText, Pencil, Plus, Rocket, Send, Tag, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";

type WorkItem = {
  id: string; module: string; record_type: string; title: string; customer_name: string; owner: string;
  team: string; status: string; priority: string; amount_cents: number; description: string; version: number;
  created_at: string; updated_at: string;
};

type DevelopmentHistory = { text: string; at: string; by?: string };
type DevelopmentData = {
  kind: "developmentTask";
  sourceTaskId?: string;
  sourceProtocol?: string;
  sourceDepartment?: string;
  triageStage: "Recebida" | "Em análise";
  processStage: "Aguardando triagem" | "Ajuste" | "Desenvolvimento" | "Correção" | "Em produção" | "Finalizada";
  versionName?: string;
  developmentType?: "Bug" | "Novo desenvolvimento";
  executor?: string;
  documentationUrl?: string;
  releaseNotes?: string;
  tested?: boolean;
  testComment?: string;
  sourceSnapshot?: { description?: string; status?: string; type?: string; priority?: string; responsible?: string; attachments?: Array<{ fileName?: string; url?: string }>; comments?: Array<{ authorName?: string; body?: string; createdAt?: string }> };
  comments?: Array<{ text: string; author: string; at: string }>;
  versionState?: "Aguardando validação" | "Em validação" | "Liberada";
  history: DevelopmentHistory[];
};
type DevelopmentRelease = { kind: "developmentRelease"; plannedAt: string; notes: string; testedBy?: string; testedAt?: string; bugReports: Array<{ text: string; author: string; at: string }> };

type Props = {
  items: WorkItem[];
  employees: Array<{ id: string; displayName: string; department?: string }>;
  user: { displayName: string; role: string; isCoordinator: boolean };
  canEdit: boolean;
  canCreate: boolean;
  busy: boolean;
  operate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>;
};

const initialDevelopment = (): DevelopmentData => ({
  kind: "developmentTask", triageStage: "Recebida", processStage: "Aguardando triagem", history: [],
});

function readDevelopment(raw: string): DevelopmentData | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DevelopmentData>;
    if (parsed.kind !== "developmentTask") return null;
  return { ...initialDevelopment(), ...parsed, history: Array.isArray(parsed.history) ? parsed.history : [], comments: Array.isArray(parsed.comments) ? parsed.comments : [] };
  } catch { return null; }
}
function readRelease(raw: string): DevelopmentRelease | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DevelopmentRelease>;
    return parsed.kind === "developmentRelease" ? { kind: "developmentRelease", plannedAt: parsed.plannedAt ?? "", notes: parsed.notes ?? "", testedBy: parsed.testedBy, testedAt: parsed.testedAt, bugReports: Array.isArray(parsed.bugReports) ? parsed.bugReports : [] } : null;
  } catch { return null; }
}

function stamp(data: DevelopmentData, text: string, by: string): DevelopmentData {
  return { ...data, history: [...data.history, { text, at: new Date().toISOString(), by }] };
}

const processColumns: Array<{ name: DevelopmentData["processStage"]; tone: string }> = [
  { name: "Ajuste", tone: "violet" }, { name: "Desenvolvimento", tone: "blue" }, { name: "Correção", tone: "amber" }, { name: "Em produção", tone: "green" },
];

const displayDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export default function DevelopmentModule({ items, employees, user, canEdit, canCreate, busy, operate }: Props) {
  const [tab, setTab] = useState<"triage" | "process" | "version">("triage");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingRelease, setEditingRelease] = useState<WorkItem | "new" | null>(null);
  const [processOwner, setProcessOwner] = useState("all");
  const records = useMemo(() => items.filter((item) => item.module === "ti" && readDevelopment(item.description)), [items]);
  const releases = useMemo(() => items.filter((item) => item.module === "ti" && readRelease(item.description)), [items]);
  const processOwners = useMemo(() => [...new Set(records
    .filter((item) => { const stage = readDevelopment(item.description)?.processStage; return stage && !["Aguardando triagem", "Finalizada"].includes(stage); })
    .map((item) => readDevelopment(item.description)?.executor || item.owner)
    .filter(Boolean))].sort(), [records]);
  const processRecords = useMemo(() => processOwner === "all" ? records : records.filter((item) => (readDevelopment(item.description)?.executor || item.owner) === processOwner), [processOwner, records]);
  const selectedDetail = selected ? readDevelopment(selected.description) : null;
  useEffect(() => {
    const subtaskId = new URLSearchParams(window.location.search).get("subtask");
    if (subtaskId) setSelected(items.find((item) => item.id === subtaskId && Boolean(readDevelopment(item.description))) ?? null);
  }, [items]);
  const save = async (item: WorkItem, detail: DevelopmentData, success: string) => {
    const result = await operate({ action: "updateWorkItem", id: item.id, title: item.title, owner: item.owner, customerName: item.customer_name, amountCents: item.amount_cents, version: item.version, description: JSON.stringify(detail) }, success);
    if (result) setSelected((current) => current?.id === item.id ? { ...current, description: JSON.stringify(detail), version: current.version + 1, updated_at: new Date().toISOString() } : current);
    return result;
  };
  const moveCard = async (item: WorkItem, target: string, lane: "triage" | "process") => {
    const detail = readDevelopment(item.description);
    if (!detail || !canEdit) return;
    const next = lane === "triage"
      ? { ...detail, triageStage: target as DevelopmentData["triageStage"] }
      : { ...detail, processStage: target as DevelopmentData["processStage"] };
    if ((lane === "triage" ? detail.triageStage : detail.processStage) === target) return;
    await save(item, stamp(next, `Movida para ${target} pelo kanban.`, user.displayName), `Demanda movida para ${target}.`);
  };
  const remove = async (item: WorkItem) => {
    const result = await operate({ action: "deleteWorkItem", id: item.id }, "Demanda excluída com sucesso.");
    if (result && selected?.id === item.id) setSelected(null);
    return result;
  };
  const canDelete = canEdit;
  const create = async (title: string, description: string) => {
    const detail = stamp(initialDevelopment(), "Tarefa incluída manualmente na triagem.", user.displayName);
    const result = await operate({ action: "createWorkItem", module: "ti", recordType: "Tarefa de desenvolvimento", title, owner: "Triagem de Desenvolvimento", team: "TI", priority: "P3", amountCents: 0, description: JSON.stringify({ ...detail, manualDescription: description }) }, "Tarefa adicionada à triagem de desenvolvimento.");
    if (result) setCreating(false);
  };
  const saveRelease = async (title: string, plannedAt: string, notes: string) => {
    const detail: DevelopmentRelease = { kind: "developmentRelease", plannedAt, notes, bugReports: [] };
    const current = editingRelease !== "new" ? editingRelease : null;
    const result = current
      ? await operate({ action: "updateWorkItem", requireConfirmation: true, id: current.id, title, owner: current.owner, customerName: current.customer_name, amountCents: current.amount_cents, version: current.version, description: JSON.stringify({ ...detail, bugReports: readRelease(current.description)?.bugReports ?? [] }) }, "Versão atualizada com sucesso.")
      : await operate({ action: "createWorkItem", module: "ti", recordType: "Versão", title, owner: user.displayName, team: "TI", priority: "P3", amountCents: 0, description: JSON.stringify(detail) }, "Versão cadastrada com sucesso.");
    if (result) setEditingRelease(null);
  };

  return <section className="development-module">
    <header className="development-heading module-page-header">
      <div className="module-page-title"><span className="module-page-title-icon"><Code2 size={21} /></span><span className="module-page-copy"><span className="eyebrow">OPERAÇÃO · TI</span><h1>Desenvolvimento</h1><p>Triagem, execução, correções e versões em uma visão única.</p></span></div>
      {canCreate && <div className="module-page-actions"><button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Nova demanda</button></div>}
    </header>
    <nav className="development-tabs">
      <button className={tab === "triage" ? "active" : ""} onClick={() => setTab("triage")}><ClipboardList size={16} /> 1. Triagem <b>{records.filter((item) => (readDevelopment(item.description)?.processStage ?? "") === "Aguardando triagem").length}</b></button>
      <button className={tab === "process" ? "active" : ""} onClick={() => setTab("process")}><Code2 size={16} /> 2. Processo <b>{records.filter((item) => { const stage = readDevelopment(item.description)?.processStage; return stage && !["Aguardando triagem", "Finalizada"].includes(stage); }).length}</b></button>
      <button className={tab === "version" ? "active" : ""} onClick={() => setTab("version")}><Rocket size={16} /> 3. Versão <b>{releases.length}</b></button>
      <span className="development-view-toggle"><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={15} /> Lista</button><button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}><Columns3 size={15} /> Kanban</button></span>
    </nav>
    {tab === "process" && <section className="development-process-filter panel"><label>Responsável pela demanda<select value={processOwner} onChange={(event) => setProcessOwner(event.target.value)}><option value="all">Todos os responsáveis</option>{processOwners.map((owner) => <option key={owner}>{owner}</option>)}</select></label><span>{processRecords.length} demanda(s)</span></section>}
    {tab === "triage" && <TriageView items={records} view={view} canEdit={canEdit} canDelete={canDelete} onOpen={setSelected} onDelete={remove} onMove={(item, stage) => void moveCard(item, stage, "triage")} />}
    {tab === "process" && <ProcessView items={processRecords} view={view} canEdit={canEdit} canDelete={canDelete} onOpen={setSelected} onDelete={remove} onMove={(item, stage) => void moveCard(item, stage, "process")} />}
    {tab === "version" && <VersionView items={records} releases={releases} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} onCreate={() => setEditingRelease("new")} onEdit={setEditingRelease} onDelete={remove} onOpen={setSelected} />}
    {selected && selectedDetail && <DevelopmentDrawerV2 item={selected} detail={selectedDetail} releases={releases} employees={employees} canEdit={canEdit} canDelete={canDelete} busy={busy} user={user} onClose={() => setSelected(null)} onDelete={() => void remove(selected)} onSave={save} />}
    {creating && <DevelopmentCreateModal busy={busy} onClose={() => setCreating(false)} onCreate={create} />}
    {editingRelease && <DevelopmentReleaseModal release={editingRelease === "new" ? undefined : editingRelease} busy={busy} onClose={() => setEditingRelease(null)} onCreate={saveRelease} />}
  </section>;
}

function DevelopmentCard({ item, canEdit, canDelete, onOpen, onDelete, onDragStart }: { item: WorkItem; canEdit: boolean; canDelete: boolean; onOpen: () => void; onDelete: () => void; onDragStart?: (event: DragEvent<HTMLElement>) => void }) {
  const detail = readDevelopment(item.description)!;
  const daysInStage = Math.max(0, Math.floor((Date.now() - new Date(item.updated_at).getTime()) / 86_400_000));
  return <article className="development-card-shell" draggable={canEdit} onDragStart={onDragStart}>{canEdit && <span className="kanban-drag-hint" aria-hidden="true">⋮⋮</span>}<div className="development-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }}><span className="development-card-code">{detail.sourceProtocol || item.id.slice(0, 8)}</span><strong>{item.title}</strong><small>{item.customer_name || "Demanda interna"}</small><footer><span>{detail.processStage}</span><em>{daysInStage} dia(s) na etapa</em></footer></div>{(canEdit || canDelete) && <span className="development-card-actions">{canEdit && <button type="button" onClick={onOpen} title="Editar detalhes" aria-label="Editar detalhes"><Pencil size={14} /></button>}{canDelete && <button type="button" className="delete" onClick={onDelete} title="Excluir demanda" aria-label="Excluir demanda"><Trash2 size={14} /></button>}</span>}</article>;
}

function TriageView({ items, view, canEdit, canDelete, onOpen, onDelete, onMove }: { items: WorkItem[]; view: "list" | "kanban"; canEdit: boolean; canDelete: boolean; onOpen: (item: WorkItem) => void; onDelete: (item: WorkItem) => void; onMove: (item: WorkItem, stage: string) => void }) {
  const triageItems = items.filter((item) => readDevelopment(item.description)?.processStage === "Aguardando triagem");
  const receivedItems = triageItems.filter((item) => readDevelopment(item.description)?.triageStage === "Recebida");
  const reviewItems = triageItems.filter((item) => !receivedItems.includes(item));
  if (view === "kanban") return <section className="development-board"><DevelopmentColumn title="Recebida" items={receivedItems} canEdit={canEdit} canDelete={canDelete} onOpen={onOpen} onDelete={onDelete} onDropItem={(id, stage) => { const item = items.find((entry) => entry.id === id); if (item) onMove(item, stage); }} /><DevelopmentColumn title="Em análise" items={reviewItems} canEdit={canEdit} canDelete={canDelete} onOpen={onOpen} onDelete={onDelete} onDropItem={(id, stage) => { const item = items.find((entry) => entry.id === id); if (item) onMove(item, stage); }} /></section>;
  const received = items.filter((item) => readDevelopment(item.description)?.triageStage === "Recebida" && readDevelopment(item.description)?.processStage === "Aguardando triagem");
  const review = items.filter((item) => readDevelopment(item.description)?.triageStage === "Em análise" && readDevelopment(item.description)?.processStage === "Aguardando triagem");
  if (view === "list") return <section className="development-list"><div className="development-list-head"><span>Demanda</span><span>Origem</span><span>Etapa da triagem</span><span>Responsável</span><span>Ações</span></div>{[...received, ...review].length === 0 ? <Empty /> : [...received, ...review].map((item) => <DevelopmentListRow key={item.id} item={item} secondary={item.customer_name || "Interno"} stage={readDevelopment(item.description)?.triageStage || "Recebida"} owner={item.owner || "Triagem"} canEdit={canEdit} canDelete={canDelete} onOpen={() => onOpen(item)} onDelete={() => onDelete(item)} />)}</section>;
  return <section className="development-board"><DevelopmentColumn title="Recebida" items={received} canEdit={canEdit} canDelete={canDelete} onOpen={onOpen} onDelete={onDelete} /><DevelopmentColumn title="Em análise" items={review} canEdit={canEdit} canDelete={canDelete} onOpen={onOpen} onDelete={onDelete} /></section>;
}

function ProcessView({ items, view, canEdit, canDelete, onOpen, onDelete, onMove }: { items: WorkItem[]; view: "list" | "kanban"; canEdit: boolean; canDelete: boolean; onOpen: (item: WorkItem) => void; onDelete: (item: WorkItem) => void; onMove: (item: WorkItem, stage: string) => void }) {
  if (view === "kanban") {
    const activeBoard = items.filter((item) => { const stage = readDevelopment(item.description)?.processStage; return stage && !["Aguardando triagem", "Finalizada"].includes(stage); });
    return <section className="development-board process-board">{processColumns.map((column) => <DevelopmentColumn key={column.name} title={column.name} tone={column.tone} items={activeBoard.filter((item) => readDevelopment(item.description)?.processStage === column.name)} canEdit={canEdit} canDelete={canDelete} onOpen={onOpen} onDelete={onDelete} onDropItem={(id, stage) => { const item = items.find((entry) => entry.id === id); if (item) onMove(item, stage); }} />)}</section>;
  }
  const active = items.filter((item) => { const stage = readDevelopment(item.description)?.processStage; return stage && !["Aguardando triagem", "Finalizada"].includes(stage); });
  if (view === "list") return <section className="development-list"><div className="development-list-head"><span>Demanda</span><span>Cliente</span><span>Processo</span><span>Atualização</span><span>Ações</span></div>{active.length === 0 ? <Empty /> : active.map((item) => <DevelopmentListRow key={item.id} item={item} secondary={item.customer_name || "Interno"} stage={readDevelopment(item.description)?.processStage || "Ajuste"} owner={displayDate(item.updated_at)} canEdit={canEdit} canDelete={canDelete} onOpen={() => onOpen(item)} onDelete={() => onDelete(item)} />)}</section>;
  return <section className="development-board process-board">{processColumns.map((column) => <DevelopmentColumn key={column.name} title={column.name} tone={column.tone} items={active.filter((item) => readDevelopment(item.description)?.processStage === column.name)} canEdit={canEdit} canDelete={canDelete} onOpen={onOpen} onDelete={onDelete} />)}</section>;
}

function VersionView({ items, releases, canCreate, canEdit, canDelete, onCreate, onEdit, onDelete, onOpen }: { items: WorkItem[]; releases: WorkItem[]; canCreate: boolean; canEdit: boolean; canDelete: boolean; onCreate: () => void; onEdit: (item: WorkItem) => void; onDelete: (item: WorkItem) => void; onOpen: (item: WorkItem) => void }) {
  return <section className="version-list panel version-list-refined">
    <header><div><span className="eyebrow">LIBERAÇÕES · TI</span><h2>Versões em validação</h2><p>Organize as entregas, pontos de teste e previsão de publicação.</p></div>{canCreate && <button className="primary-button" onClick={onCreate}><Plus size={16} /> Nova versão</button>}</header>
    {releases.length === 0 ? <Empty text="Cadastre a primeira versão para encaminhar demandas." /> : <div className="version-release-grid">{releases.map((release) => {
      const detail = readRelease(release.description)!;
      const related = items.filter((item) => readDevelopment(item.description)?.versionName === release.title);
      const validated = related.filter((item) => /valid|testad|liberad/i.test(readDevelopment(item.description)?.versionState || "")).length;
      return <article className="version-release" key={release.id}>
        <div className="version-release-head"><span className="version-mark"><GitBranch size={19} /></span><span className="version-release-title"><b>{release.title}</b><small>{detail.plannedAt ? `Previsão ${displayDate(detail.plannedAt)}` : "Sem previsão definida"}</small></span><em className={detail.testedBy ? "is-tested" : ""}>{detail.testedBy ? "Testada" : "Em validação"}</em><span className="development-inline-actions">{canEdit && <button type="button" onClick={() => onEdit(release)} title="Editar versão" aria-label="Editar versão"><Pencil size={15} /></button>}{canDelete && <button type="button" className="delete" onClick={() => onDelete(release)} title="Excluir versão" aria-label="Excluir versão"><Trash2 size={15} /></button>}</span></div>
        <div className="version-release-meta"><span><b>{related.length}</b><small>Demandas</small></span><span><b>{validated}</b><small>Validadas</small></span><span><b>{Math.max(0, related.length - validated)}</b><small>Pendentes</small></span></div>
        {detail.notes && <p className="version-release-notes">{detail.notes}</p>}
        <div className="version-release-tasks"><strong className="version-task-heading">Pontos da versão</strong>{related.length === 0 ? <small>Nenhuma tarefa encaminhada ainda.</small> : related.map((item) => <div className="version-row-shell" key={item.id}><button className="version-row" onClick={() => onOpen(item)}><span><b>{item.title}</b><small>{readDevelopment(item.description)?.sourceProtocol || "Demanda TI"}</small></span><span>{readDevelopment(item.description)?.versionState || "Aguardando validação"}</span><ChevronRight size={17} /></button><span className="development-inline-actions">{canEdit && <button type="button" onClick={() => onOpen(item)} title="Editar demanda"><Pencil size={14} /></button>}{canDelete && <button type="button" className="delete" onClick={() => onDelete(item)} title="Excluir demanda"><Trash2 size={14} /></button>}</span></div>)}</div>
      </article>;
    })}</div>}
  </section>;
}

function DevelopmentListRow({ item, secondary, stage, owner, canEdit, canDelete, onOpen, onDelete }: { item: WorkItem; secondary: string; stage: string; owner: string; canEdit: boolean; canDelete: boolean; onOpen: () => void; onDelete: () => void }) {
  return <div className="development-list-row"><button className="development-list-main" onClick={onOpen}><span><b>{item.title}</b><small>{readDevelopment(item.description)?.sourceProtocol || "Demanda manual"}</small></span><span>{secondary}</span><span>{stage}</span><span>{owner}</span><ChevronRight size={17} /></button><span className="development-inline-actions">{canEdit && <button type="button" onClick={onOpen} title="Editar demanda"><Pencil size={14} /></button>}{canDelete && <button type="button" className="delete" onClick={onDelete} title="Excluir demanda"><Trash2 size={14} /></button>}</span></div>;
}

function DevelopmentColumn({ title, items, tone, canEdit = false, canDelete = false, onOpen, onDelete = () => undefined, onDropItem }: { title: string; items: WorkItem[]; tone?: string; canEdit?: boolean; canDelete?: boolean; onOpen: (item: WorkItem) => void; onDelete?: (item: WorkItem) => void; onDropItem?: (id: string, stage: string) => void }) {
  const [limit, setLimit] = useState(10);
  const visibleItems = items.slice(0, limit);
  return <section className={`development-column ${tone ?? ""}`} onDragOver={(event) => { if (canEdit && onDropItem) { event.preventDefault(); event.currentTarget.classList.add("drag-over"); } }} onDragLeave={(event) => event.currentTarget.classList.remove("drag-over")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("drag-over"); const id = event.dataTransfer.getData("workItemId"); if (id) onDropItem?.(id, title); }}><header><span>{title}</span><b>{items.length}</b></header><div>{items.length ? visibleItems.map((item) => <DevelopmentCard item={item} canEdit={canEdit} canDelete={canDelete} onOpen={() => onOpen(item)} onDelete={() => void onDelete(item)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("workItemId", item.id); }} key={item.id} />) : <p>Arraste um card para esta etapa.</p>}{items.length > visibleItems.length && <button type="button" className="development-column-more" onClick={() => setLimit((value) => value + 10)}>Ver mais ({items.length - visibleItems.length})</button>}</div></section>;
}

function DevelopmentDrawer({ item, detail, employees, canEdit, busy, user, onClose, onSave }: { item: WorkItem; detail: DevelopmentData; employees: Props["employees"]; canEdit: boolean; busy: boolean; user: Props["user"]; onClose: () => void; onSave: (item: WorkItem, detail: DevelopmentData, success: string) => Promise<{ id?: string } | false> }) {
  const [version, setVersion] = useState(detail.versionName ?? "");
  const [executor, setExecutor] = useState(detail.executor ?? "");
  const [developmentType, setDevelopmentType] = useState<"Bug" | "Novo desenvolvimento">(detail.developmentType ?? "Bug");
  const [documentationUrl, setDocumentationUrl] = useState(detail.documentationUrl ?? "");
  const [releaseNotes, setReleaseNotes] = useState(detail.releaseNotes ?? "");
  const [comment, setComment] = useState("");
  const update = (next: DevelopmentData, success: string) => void onSave(item, next, success);
  const approveTriage = () => update(stamp({ ...detail, triageStage: "Em análise" }, "Triagem iniciada.", user.displayName), "Tarefa movida para análise da triagem.");
  const forwardAdjustment = () => update(stamp({ ...detail, processStage: "Ajuste", developmentType, executor }, `Encaminhada para ${developmentType.toLocaleLowerCase("pt-BR")} com responsável ${executor || "não definido"}.`, user.displayName), "Tarefa encaminhada para ajuste.");
  const finish = () => update(stamp({ ...detail, processStage: "Finalizada" }, "Tarefa finalizada pelo time de desenvolvimento.", user.displayName), "Tarefa finalizada com sucesso.");
  const publishVersion = () => { if (!version.trim()) return; update(stamp({ ...detail, processStage: "Em produção", versionName: version.trim(), documentationUrl, releaseNotes, versionState: "Em validação" }, `Versão ${version.trim()} enviada para validação.`, user.displayName), "Versão enviada para validação."); };
  const inProduction = () => update(stamp({ ...detail, processStage: "Em produção", versionState: "Liberada" }, "Correção marcada como disponível em produção. Coordenação deve orientar o cliente.", user.displayName), "Correção liberada e coordenação notificada.");
  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer development-drawer"><header className="drawer-head simple"><div><span className="eyebrow">DESENVOLVIMENTO · {detail.processStage}</span><h2>{item.title}</h2><p>{detail.sourceProtocol ? `Origem: ${detail.sourceProtocol}` : "Demanda cadastrada diretamente na triagem"}</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></header><div className="development-drawer-content"><section className="development-info-grid"><div><span>Triagem</span><strong>{detail.triageStage}</strong></div><div><span>Processo</span><strong>{detail.processStage}</strong></div><div><span>Cliente</span><strong>{item.customer_name || "Interno"}</strong></div><div><span>Solicitante</span><strong>{item.owner || "Não informado"}</strong></div></section><section className="development-description"><span>DESCRIÇÃO DA SOLICITAÇÃO</span><p>{detail.sourceTaskId ? "Tarefa recebida da operação corporativa. Consulte a tarefa de origem para evidências e comentários." : (detail as DevelopmentData & { manualDescription?: string }).manualDescription || "Sem detalhes adicionais."}</p></section>{canEdit && <section className="development-actions"><div><span className="eyebrow">AÇÕES DO FLUXO</span><h3>{detail.processStage === "Aguardando triagem" ? "Triagem da demanda" : "Execução e publicação"}</h3></div>{detail.processStage === "Aguardando triagem" && <div className="drawer-actions"><button className="secondary-button" disabled={busy || detail.triageStage === "Em análise"} onClick={approveTriage}>Iniciar análise</button><button className="primary-button" disabled={busy} onClick={forwardAdjustment}><Send size={15} /> Encaminhar para ajuste</button><button className="secondary-button danger-action" disabled={busy} onClick={finish}>Finalizar tarefa</button></div>}{["Ajuste", "Desenvolvimento", "Correção"].includes(detail.processStage) && <div className="drawer-actions"><button className="secondary-button" disabled={busy} onClick={() => update(stamp({ ...detail, processStage: "Desenvolvimento" }, "Tarefa assumida no desenvolvimento.", user.displayName), "Tarefa movida para desenvolvimento.")}><Code2 size={15} /> Em desenvolvimento</button><button className="secondary-button" disabled={busy} onClick={() => update(stamp({ ...detail, processStage: "Correção" }, "Tarefa movida para correção.", user.displayName), "Tarefa movida para correção.")}>Correção</button><button className="primary-button" disabled={busy} onClick={finish}><CheckCircle2 size={15} /> Finalizar tarefa</button></div>}{detail.processStage !== "Aguardando triagem" && detail.processStage !== "Finalizada" && <div className="development-version-action"><label>Subir versão<input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="Ex.: 4.32.0" /></label><button className="secondary-button" disabled={busy} onClick={publishVersion}><Tag size={15} /> Subir versão</button><button className="primary-button" disabled={busy} onClick={inProduction}><Rocket size={15} /> Já em produção</button></div>}</section>}<section className="development-history"><header><span className="eyebrow">HISTÓRICO</span><h3>Movimentações da demanda</h3></header>{detail.history.length === 0 ? <p>Nenhuma movimentação registrada.</p> : detail.history.slice().reverse().map((entry, index) => <article key={`${entry.at}-${index}`}><i /><div><b>{entry.text}</b><small>{entry.by || "Sistema"} · {displayDate(entry.at)}</small></div></article>)}</section></div></aside></div>;
}

function DevelopmentCreateModal({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (title: string, description: string) => Promise<void> }) { const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); return <div className="modal-backdrop"><form className="modal-shell development-create-modal" onSubmit={(event) => { event.preventDefault(); void onCreate(title, description); }}><header><div><span className="eyebrow">NOVA DEMANDA</span><h2>Adicionar à triagem</h2><p>A tarefa será incluída na primeira etapa da triagem.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></header><label>Título *<input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Resumo da demanda" /></label><label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} placeholder="Contexto, impacto e evidências." /></label><footer><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || !title.trim()}><Plus size={16} /> Adicionar à triagem</button></footer></form></div>; }

function DevelopmentReleaseModal({ release, busy, onClose, onCreate }: { release?: WorkItem; busy: boolean; onClose: () => void; onCreate: (title: string, plannedAt: string, notes: string) => Promise<void> }) {
  const initial = release ? readRelease(release.description) : null;
  const [title, setTitle] = useState(release?.title ?? ""); const [plannedAt, setPlannedAt] = useState(initial?.plannedAt?.slice(0, 10) ?? ""); const [notes, setNotes] = useState(initial?.notes ?? "");
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal development-release-modal" role="dialog" aria-modal="true" aria-label="Planejar liberação"><div className="modal-head"><div><span className="eyebrow">{release ? "EDITAR VERSÃO" : "NOVA VERSÃO"}</span><h2>{release ? "Atualizar liberação" : "Planejar liberação"}</h2><p>Cadastre a data e o contexto. Depois, as demandas de TI poderão ser encaminhadas para esta versão.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void onCreate(title, plannedAt, notes); }}><label className="wide">Título da versão *<input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Ex.: 2026.08.1" /></label><label>Data prevista *<input type="date" value={plannedAt} onChange={(event) => setPlannedAt(event.target.value)} required /></label><label className="wide">Observação<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Resumo da versão e pontos previstos." /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button compact-save" disabled={busy || !title.trim() || !plannedAt}><Rocket size={16} /> {release ? "Salvar alterações" : "Cadastrar versão"}</button></div></form></section></div>;
}

function DevelopmentDrawerV2({ item, detail, releases, employees, canEdit, canDelete, busy, user, onClose, onDelete, onSave }: { item: WorkItem; detail: DevelopmentData; releases: WorkItem[]; employees: Props["employees"]; canEdit: boolean; canDelete: boolean; busy: boolean; user: Props["user"]; onClose: () => void; onDelete: () => void; onSave: (item: WorkItem, detail: DevelopmentData, success: string) => Promise<{ id?: string } | false> }) {
  const [executor, setExecutor] = useState(detail.executor ?? ""); const [kind, setKind] = useState<"Bug" | "Novo desenvolvimento">(detail.developmentType ?? "Bug"); const [version, setVersion] = useState(detail.versionName ?? ""); const [doc, setDoc] = useState(detail.documentationUrl ?? ""); const [points, setPoints] = useState(detail.releaseNotes ?? ""); const [comment, setComment] = useState("");
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const save = (next: DevelopmentData, message: string) => void onSave(item, stamp(next, message, user.displayName), message);
  const snapshot = detail.sourceSnapshot;
  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer development-drawer"><header className="drawer-head simple"><div><span className="eyebrow">TI · {detail.processStage}</span><h2>{item.title}</h2><p>{detail.sourceProtocol ? `Tarefa matriz ${detail.sourceProtocol}` : "Demanda interna"}</p></div><div className="development-drawer-head-actions">{canEdit && <button type="button" className="secondary-button" onClick={() => document.querySelector<HTMLElement>(".development-actions")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Pencil size={15} /> Editar</button>}{canDelete && <button type="button" className="danger-button" disabled={busy} onClick={onDelete}><Trash2 size={15} /> Excluir</button>}<button className="icon-button" onClick={onClose}><X size={20} /></button></div></header><div className="development-drawer-content"><section className="development-info-grid"><div><span>Tipo</span><strong>{detail.developmentType ?? "A definir"}</strong></div><div><span>Responsável TI</span><strong>{detail.executor ?? "A definir"}</strong></div><div><span>Cliente</span><strong>{item.customer_name || "Interno"}</strong></div><div><span>Etapa do Kanban</span>{canEdit?<select value={detail.processStage} disabled={busy} onChange={event=>save({...detail,processStage:event.target.value as DevelopmentData["processStage"],triageStage:event.target.value==="Aguardando triagem"?"Recebida":detail.triageStage},`Tarefa movida para ${event.target.value}.`)}><option>Aguardando triagem</option>{processColumns.map(column=><option key={column.name}>{column.name}</option>)}<option>Finalizada</option></select>:<strong>{detail.processStage}</strong>}</div></section><section className="development-description"><span>TAREFA MATRIZ</span><p>{snapshot?.description || "Sem descrição disponível."}</p><div className="development-source-meta"><span>{snapshot?.type || "Sem tipo"}</span><span>{snapshot?.status || "Sem status"}</span><span>{snapshot?.priority || "Sem prioridade"}</span></div>{snapshot?.attachments?.length ? <div className="comment-attachments">{snapshot.attachments.map((file, index) => <a href={file.url} target="_blank" rel="noreferrer" key={`${file.url}-${index}`}><FileText size={14} /> {file.fileName || "Evidência"}</a>)}</div> : <small>Sem fotos ou vídeos anexados.</small>}{detail.sourceTaskId && <button className="secondary-button" type="button" onClick={() => { window.location.href = `/?mod=tasks&task=${detail.sourceTaskId}`; }}><ClipboardList size={15} /> Acessar tarefa completa</button>}</section>{canEdit && detail.processStage === "Aguardando triagem" && <section className="development-actions"><h3>Triagem e encaminhamento</h3><div className="lead-control-grid"><label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value as "Bug" | "Novo desenvolvimento")}><option>Bug</option><option>Novo desenvolvimento</option></select></label><label>Responsável do TI<select value={executor} onChange={(event) => setExecutor(event.target.value)}><option value="">Selecionar colaborador</option>{employees.map((employee) => <option value={employee.displayName} key={employee.id}>{employee.displayName}</option>)}</select></label></div><div className="drawer-actions"><button className="secondary-button" disabled={busy} onClick={() => save({ ...detail, triageStage: "Em análise" }, "Triagem iniciada.")}>Iniciar análise</button><button className="primary-button" disabled={busy || !executor} onClick={() => save({ ...detail, triageStage: "Em análise", processStage: "Ajuste", developmentType: kind, executor }, `Encaminhada para ${kind.toLocaleLowerCase("pt-BR")}.`)}><Send size={15} /> Enviar para ajuste</button></div></section>}{canEdit && detail.processStage !== "Aguardando triagem" && <section className="development-actions"><h3>Publicação</h3><div className="lead-control-grid"><label>Versão vinculada<input readOnly value={version || "Nenhuma versão selecionada"} /></label><label>Documentação<input value={doc} onChange={(event) => setDoc(event.target.value)} placeholder="https://..." /></label><label className="wide">Pontos da versão<textarea value={points} onChange={(event) => setPoints(event.target.value)} rows={3} placeholder="Liste os pontos que serão liberados." /></label></div><div className="drawer-actions"><button className="secondary-button" disabled={busy || releases.length===0} onClick={() => setShowVersionPicker(true)}><Tag size={15} /> Subir versão</button><button className="primary-button" disabled={busy || !detail.versionName} onClick={() => save({ ...detail, processStage: "Em produção", versionState: "Liberada" }, "Funcionalidade liberada em produção.")}><Rocket size={15} /> Já em produção</button></div>{releases.length===0&&<small>Cadastre uma versão na etapa Versão antes de publicar.</small>}{detail.versionName && <label className="checkbox-label"><input type="checkbox" checked={detail.tested ?? false} onChange={(event) => save({ ...detail, tested: event.target.checked, testComment: detail.testComment ?? "" }, event.target.checked ? `Versão testada por ${user.displayName}.` : "Teste da versão reaberto.")} /> Marcar como testada por {user.displayName}</label>}</section>}<section className="development-history"><header><span className="eyebrow">COMENTÁRIOS E HISTÓRICO</span><h3>Participantes da demanda</h3></header><div className="enterprise-comment-form"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Comentário, resposta ou relato de bug..." rows={3} /><button className="primary-button" disabled={busy || !comment.trim()} onClick={() => { save({ ...detail, comments: [...(detail.comments ?? []), { text: comment.trim(), author: user.displayName, at: new Date().toISOString() }] }, "Comentário registrado e disponibilizado aos participantes."); setComment(""); }}><MessageSquareText size={15} /> Comentar</button></div>{(detail.comments ?? []).slice().reverse().map((entry, index) => <article key={`${entry.at}-${index}`}><i /><div><b>{entry.author}</b><small>{displayDate(entry.at)}</small><p>{entry.text}</p></div></article>)}{detail.history.slice().reverse().map((entry, index) => <article key={`${entry.at}-h-${index}`}><i /><div><b>{entry.text}</b><small>{entry.by || "Sistema"} · {displayDate(entry.at)}</small></div></article>)}</section></div></aside>{showVersionPicker&&<DevelopmentVersionPicker releases={releases} selected={version} busy={busy} onClose={()=>setShowVersionPicker(false)} onPublish={(selectedVersion)=>{setVersion(selectedVersion);save({ ...detail, versionName:selectedVersion, documentationUrl:doc, releaseNotes:points, versionState:"Em validação" }, `Versão ${selectedVersion} enviada para teste.`);setShowVersionPicker(false)}}/>}</div>;
}

function DevelopmentVersionPicker({releases,selected,busy,onClose,onPublish}:{releases:WorkItem[];selected:string;busy:boolean;onClose:()=>void;onPublish:(version:string)=>void}){
  const [value,setValue]=useState(selected);
  return <div className="modal-backdrop nested-modal development-version-picker" onMouseDown={event=>event.currentTarget===event.target&&onClose()}><section className="modal development-release-modal"><div className="modal-head"><div><span className="eyebrow">PUBLICAÇÃO</span><h2>Selecionar versão</h2><p>Escolha em qual versão cadastrada esta entrega será disponibilizada para testes.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="form-grid"><label className="wide">Versão cadastrada *<select value={value} onChange={event=>setValue(event.target.value)} autoFocus><option value="">Selecionar versão...</option>{releases.map(release=><option value={release.title} key={release.id}>{release.title}</option>)}</select></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="primary-button" disabled={busy||!value} onClick={()=>onPublish(value)}><Tag size={15}/> Confirmar e subir versão</button></div></div></section></div>;
}

function Empty({ text = "Nenhuma tarefa nesta visualização." }: { text?: string }) { return <div className="development-empty"><ClipboardList size={22} /><p>{text}</p></div>; }
