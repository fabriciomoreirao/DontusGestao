"use client";

import {
  AlertTriangle, ArrowRight, BadgeCheck, Check, CheckCircle2, CircleDot, Columns3, Copy, Flag, Hash, List,
  MessageSquareText, Pencil, Plus, Search, Settings2, ShieldAlert, Sparkles,
  Trash2, UserRound, X,
} from "lucide-react";
import { FormEvent, useMemo, useState, type CSSProperties, type ReactNode } from "react";

export type SuggestionPriority = { id: string; name: string; description: string; color: string; displayOrder: number; active: boolean };
export type SuggestionStatus = { id: string; name: string; description: string; kanbanColumn: string; color: string; displayOrder: number; isInitial: boolean; active: boolean };
export type SuggestionComment = { id: string; suggestionId: string; authorUserId: string; authorName: string; authorPhotoDataUrl: string; authorIsCoordinator: boolean; body: string; createdAt: string };
export type Suggestion = {
  id: string; number: number; protocol: string; name: string; description: string;
  customerId: string | null; customerName: string; responsibleUserId: string; responsibleName: string;
  responsibleEmail: string; responsiblePhotoDataUrl: string; responsibleIsCoordinator: boolean; priorityId: string; priorityName: string;
  priorityColor: string; statusId: string; statusName: string; statusColor: string; kanbanColumn: string;
  strategicClient: boolean; cancellationRisk: boolean; createdBy: string; createdAt: string;
  updatedAt: string; version: number; comments: SuggestionComment[];
};
export type SuggestionModuleData = {
  priorities: SuggestionPriority[];
  statuses: SuggestionStatus[];
  suggestions: Suggestion[];
  currentUser: { id: string; name: string; email: string; photoDataUrl: string; isCoordinator: boolean };
  canManageCatalogs: boolean;
};
type Customer = { id: string; trade_name: string; legal_name: string };
type OperationResult = { id?: string; createdProtocol?: string } | false;
type Operate = (payload: Record<string, unknown>, success: string) => Promise<OperationResult>;
const isSuggestionStatus = (item: SuggestionPriority | SuggestionStatus): item is SuggestionStatus => "kanbanColumn" in item;

const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

function Avatar({ name, photo, small = false, coordinator = false }: { name: string; photo?: string; small?: boolean; coordinator?: boolean }) {
  return <span className={`suggestion-avatar-wrap ${small ? "small" : ""}`}>{photo ? <img className={`suggestion-avatar ${small ? "small" : ""}`} src={photo} alt="" /> : <span className={`suggestion-avatar fallback ${small ? "small" : ""}`}>{name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>}{coordinator && <i className="coordinator-mark" title="Coordenador"><BadgeCheck size={11} /></i>}</span>;
}

function FlagBadges({ suggestion, compact = false }: { suggestion: Suggestion; compact?: boolean }) {
  if (!suggestion.strategicClient && !suggestion.cancellationRisk) return compact ? null : <span className="suggestion-muted">Sem sinalizadores</span>;
  return <span className="suggestion-flags">
    {suggestion.strategicClient && <span className="suggestion-flag strategic" title="Cliente estratégico"><Sparkles size={12} />{!compact && "Cliente estratégico"}</span>}
    {suggestion.cancellationRisk && <span className="suggestion-flag risk" title="Risco de cancelamento"><ShieldAlert size={12} />{!compact && "Risco de cancelamento"}</span>}
  </span>;
}

export default function SuggestionsModule({ module, customers, canCreate, canEdit, canDelete, busy, operate }: {
  module: SuggestionModuleData; customers: Customer[]; canCreate: boolean; canEdit: boolean; canDelete: boolean; busy: boolean; operate: Operate;
}) {
  const [view, setView] = useState<"list" | "kanban">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdProtocol, setCreatedProtocol] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = module.suggestions.find((entry) => entry.id === selectedId) ?? null;
  const activeStatuses = module.statuses.filter((entry) => entry.active).sort((a, b) => a.displayOrder - b.displayOrder);
  const activePriorities = module.priorities.filter((entry) => entry.active).sort((a, b) => a.displayOrder - b.displayOrder);
  const effectiveStatusFilter = activeStatuses.some((entry) => entry.id === statusFilter) ? statusFilter : "";
  const effectivePriorityFilter = activePriorities.some((entry) => entry.id === priorityFilter) ? priorityFilter : "";
  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return module.suggestions.filter((entry) => {
      const matchesText = !normalized || `${entry.protocol} ${entry.name} ${entry.description} ${entry.customerName} ${entry.responsibleName}`.toLocaleLowerCase("pt-BR").includes(normalized);
      return matchesText && (!effectiveStatusFilter || entry.statusId === effectiveStatusFilter) && (!effectivePriorityFilter || entry.priorityId === effectivePriorityFilter);
    });
  }, [module.suggestions, search, effectiveStatusFilter, effectivePriorityFilter]);

  const changeStatus = async (suggestion: Suggestion, statusId: string) => {
    if (!canEdit || suggestion.statusId === statusId) return;
    await operate({ action: "changeSuggestionStatus", id: suggestion.id, statusId, version: suggestion.version }, "Status da sugestão atualizado com sucesso.");
  };
  const sendToDevelopment = async (suggestion: Suggestion) => {
    const copy = await operate({
      action: "createWorkItem", module: "ti", recordType: "Tarefa de desenvolvimento", title: suggestion.name,
      customerName: suggestion.customerName, owner: suggestion.responsibleName, team: "Desenvolvimento", priority: "P3", amountCents: 0,
      description: JSON.stringify({
        kind: "developmentTask",
        sourceTaskId: suggestion.id,
        sourceProtocol: suggestion.protocol,
        sourceDepartment: "Sugestões",
        triageStage: "Recebida",
        processStage: "Aguardando triagem",
        sourceSnapshot: {
          description: suggestion.description,
          type: "Sugestão aprovada",
          priority: suggestion.priorityName,
          responsible: suggestion.responsibleName,
          comments: suggestion.comments.map((comment) => ({ authorName: comment.authorName, body: comment.body, createdAt: comment.createdAt })),
        },
        comments: suggestion.comments.map((comment) => ({ text: comment.body, author: comment.authorName, at: comment.createdAt })),
        history: [{ text: `Sugestão ${suggestion.protocol} recebida para triagem.`, at: new Date().toISOString(), by: suggestion.responsibleName }],
      }),
      originType: "suggestion", originId: suggestion.id,
    }, "Sugestão enviada para a triagem de Desenvolvimento.");
    if (!copy) return false;
    const concluded = activeStatuses.find((entry) => /conclu|finaliz|resolvid/i.test(`${entry.name} ${entry.kanbanColumn}`));
    if (concluded) await changeStatus(suggestion, concluded.id);
    return copy;
  };

  const configured = activeStatuses.length > 0 && activePriorities.length > 0;
  return <section className="suggestions-page">
    <header className="suggestions-header">
      <div><span className="eyebrow">MÓDULO DE MELHORIAS</span><h1><Sparkles size={28} /> Sugestões</h1><p>Registre ideias, acompanhe decisões e visualize a evolução de cada sugestão.</p></div>
      {canCreate && <button className="primary-button" disabled={!configured} onClick={() => setCreating(true)}><Plus size={17} /> Nova sugestão</button>}
    </header>

    {!configured && <div className="suggestion-setup-warning"><Settings2 size={20} /><span><strong>Cadastros necessários</strong><small>Configure ao menos uma prioridade e um status ativo em Cadastros › Sugestões.</small></span></div>}

    <div className="suggestion-toolbar panel">
      <label className="suggestion-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por protocolo, nome, cliente ou descrição..." /></label>
      <select value={effectiveStatusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos os status</option>{activeStatuses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
      <select value={effectivePriorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">Todas as prioridades</option>{activePriorities.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
      <span className="suggestion-result-count">{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
    </div>

    <div className="suggestion-view-switch" role="tablist" aria-label="Visualização das sugestões">
      <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={16} /> Lista</button>
      <button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}><Columns3 size={16} /> Kanban</button>
    </div>

    {view === "list" ? <SuggestionList suggestions={filtered} canDelete={canDelete} currentUserEmail={module.currentUser.email} onOpen={setSelectedId} onDelete={async (entry) => { const result = await operate({ action: "deleteSuggestion", id: entry.id }, "Sugestão excluída com sucesso."); if (result && selectedId === entry.id) setSelectedId(null); }} /> : <SuggestionKanban suggestions={filtered} statuses={activeStatuses} canEdit={canEdit} canDelete={canDelete} currentUserEmail={module.currentUser.email} onOpen={setSelectedId} onDelete={async (entry) => { const result = await operate({ action: "deleteSuggestion", id: entry.id }, "Sugestão excluída com sucesso."); if (result && selectedId === entry.id) setSelectedId(null); }} onChangeStatus={changeStatus} />}

    {creating && <NewSuggestionModal module={module} customers={customers} busy={busy} onClose={() => setCreating(false)} onSave={async (payload) => {
      const result = await operate({ action: "createSuggestion", ...payload }, "Sugestão cadastrada com sucesso.");
      if (result) { setCreating(false); setCreatedProtocol(result.createdProtocol ?? ""); }
    }} />}
    {createdProtocol && <SuggestionCreatedModal protocol={createdProtocol} onClose={() => setCreatedProtocol("")} />}
    {selected && <SuggestionDetailsModal suggestion={selected} statuses={activeStatuses} canEdit={canEdit} canDelete={canDelete || selected.responsibleEmail === module.currentUser.email} busy={busy} onClose={() => setSelectedId(null)} onDelete={async () => { const result = await operate({ action: "deleteSuggestion", id: selected.id }, "Sugestão excluída com sucesso."); if (result) setSelectedId(null); }} onStatus={(statusId) => changeStatus(selected, statusId)} onSendToDevelopment={() => sendToDevelopment(selected)} onComment={async (body) => {
      return Boolean(await operate({ action: "addSuggestionComment", id: selected.id, body }, "Comentário adicionado com sucesso."));
    }} />}
  </section>;
}

function SuggestionCreatedModal({ protocol, onClose }: { protocol: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(protocol);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <div className="modal-backdrop"><div className="modal suggestion-created-modal" role="dialog" aria-modal="true" aria-label="Sugestão criada com sucesso">
    <div className="suggestion-created-icon"><CheckCircle2 size={34} /></div>
    <span className="eyebrow">CADASTRO CONCLUÍDO</span>
    <h2>Sugestão criada com sucesso</h2>
    <p>Use o protocolo abaixo para localizar e acompanhar esta solicitação.</p>
    <button type="button" className="suggestion-protocol-copy" onClick={() => void copy()}><span><small>Protocolo</small><strong>{protocol}</strong></span>{copied ? <Check size={18} /> : <Copy size={18} />}</button>
    <div className="modal-actions"><button type="button" className="primary-button" onClick={onClose}>Concluído</button></div>
  </div></div>;
}

function SuggestionList({ suggestions, canDelete, currentUserEmail, onOpen, onDelete }: { suggestions: Suggestion[]; canDelete: boolean; currentUserEmail: string; onOpen: (id: string) => void; onDelete: (suggestion: Suggestion) => void }) {
  if (!suggestions.length) return <div className="suggestion-empty panel"><Sparkles size={27} /><strong>Nenhuma sugestão encontrada</strong><p>Quando uma sugestão for cadastrada, ela aparecerá aqui e no Kanban.</p></div>;
  return <div className="suggestion-table-wrap panel"><table className="suggestion-table"><thead><tr><th>Protocolo</th><th>Sugestão</th><th>Sinalizadores</th><th>Prioridade</th><th>Status</th><th>Responsável</th><th>Atualização</th><th>Ações</th></tr></thead><tbody>
    {suggestions.map((entry) => <tr key={entry.id} tabIndex={0} onClick={() => onOpen(entry.id)} onKeyDown={(event) => event.key === "Enter" && onOpen(entry.id)}>
      <td><strong className="suggestion-protocol"><Hash size={13} />{entry.protocol}</strong></td>
      <td><span className="suggestion-title-cell"><strong>{entry.name}</strong><small>{entry.customerName}</small></span></td>
      <td><FlagBadges suggestion={entry} compact /></td>
      <td><span className="suggestion-color-badge" style={{ "--badge-color": entry.priorityColor } as CSSProperties}>{entry.priorityName}</span></td>
      <td><span className="suggestion-color-badge" style={{ "--badge-color": entry.statusColor } as CSSProperties}>{entry.statusName}</span></td>
      <td><span className="suggestion-owner"><Avatar name={entry.responsibleName} photo={entry.responsiblePhotoDataUrl} small /><span>{entry.responsibleName}</span></span></td>
      <td><time>{dateTime(entry.updatedAt)}</time></td>
      <td>{(canDelete || entry.responsibleEmail === currentUserEmail) && <button type="button" className="icon-button danger-action" aria-label={`Excluir ${entry.name}`} onClick={(event) => { event.stopPropagation(); onDelete(entry); }}><Trash2 size={15} /></button>}</td>
    </tr>)}
  </tbody></table></div>;
}

function SuggestionKanban({ suggestions, statuses, canEdit, canDelete, currentUserEmail, onOpen, onDelete, onChangeStatus }: {
  suggestions: Suggestion[]; statuses: SuggestionStatus[]; canEdit: boolean; canDelete: boolean; currentUserEmail: string; onOpen: (id: string) => void; onDelete: (suggestion: Suggestion) => void; onChangeStatus: (suggestion: Suggestion, statusId: string) => void;
}) {
  if (!statuses.length) return <div className="suggestion-empty panel"><Columns3 size={27} /><strong>Kanban ainda não configurado</strong><p>Cadastre o primeiro status para criar uma coluna.</p></div>;
  return <div className="suggestion-kanban">
    {statuses.map((status) => {
      const cards = suggestions.filter((entry) => entry.statusId === status.id);
      return <section className="suggestion-kanban-column" key={status.id} onDragOver={(event) => canEdit && event.preventDefault()} onDrop={(event) => {
        if (!canEdit) return;
        const suggestion = suggestions.find((entry) => entry.id === event.dataTransfer.getData("text/suggestion-id"));
        if (suggestion) void onChangeStatus(suggestion, status.id);
      }}>
        <header style={{ "--column-color": status.color } as CSSProperties}><span><i />{status.kanbanColumn || status.name}</span><b>{cards.length}</b></header>
        <div className="suggestion-kanban-cards">
          {cards.map((entry) => <article key={entry.id} className={entry.cancellationRisk ? "risk-card" : ""} draggable={canEdit} onDragStart={(event) => event.dataTransfer.setData("text/suggestion-id", entry.id)} onClick={() => onOpen(entry.id)}>
            <div className="suggestion-card-top"><span>{entry.protocol}</span><span className="suggestion-color-badge" style={{ "--badge-color": entry.priorityColor } as CSSProperties}>{entry.priorityName}</span></div>
            <h3>{entry.name}</h3><p>{entry.description || "Sem descrição informada."}</p><FlagBadges suggestion={entry} />
            <footer><span className="suggestion-owner"><Avatar name={entry.responsibleName} photo={entry.responsiblePhotoDataUrl} small /><span>{entry.responsibleName}</span></span><span className="suggestion-card-actions">{entry.comments.length > 0 && <span><MessageSquareText size={13} />{entry.comments.length}</span>}{(canDelete || entry.responsibleEmail === currentUserEmail) && <button type="button" className="icon-button danger-action" aria-label={`Excluir ${entry.name}`} onClick={(event) => { event.stopPropagation(); onDelete(entry); }}><Trash2 size={14} /></button>}</span></footer>
          </article>)}
          {cards.length === 0 && <div className="suggestion-column-empty">Nenhuma sugestão nesta etapa</div>}
        </div>
      </section>;
    })}
  </div>;
}

function NewSuggestionModal({ module, customers, busy, onClose, onSave }: { module: SuggestionModuleData; customers: Customer[]; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const priorities = module.priorities.filter((entry) => entry.active).sort((a, b) => a.displayOrder - b.displayOrder);
  const initialStatus = module.statuses.filter((entry) => entry.active).sort((a, b) => Number(b.isInitial) - Number(a.isInitial) || a.displayOrder - b.displayOrder)[0];
  const [strategicClient, setStrategicClient] = useState(false);
  const [cancellationRisk, setCancellationRisk] = useState(false);
  return <div className="modal-backdrop"><form className="modal suggestion-create-modal" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ name: form.get("name"), description: form.get("description"), customerId: form.get("customerId") || null, priorityId: form.get("priorityId"), strategicClient, cancellationRisk });
  }}>
    <div className="modal-header"><div><span className="eyebrow">SUGESTÕES</span><h2>Nova sugestão</h2><p>O protocolo será gerado automaticamente ao concluir o cadastro.</p></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
    <div className="modal-body">
      <div className="suggestion-auto-fields"><div><Hash size={18} /><span><small>Protocolo</small><strong>Gerado automaticamente</strong></span></div><div><Avatar name={module.currentUser.name} photo={module.currentUser.photoDataUrl} coordinator={module.currentUser.isCoordinator} small /><span><small>Responsável</small><strong>{module.currentUser.name}</strong></span></div></div>
      <label className="field span-2"><span>Nome da sugestão *</span><input name="name" required maxLength={240} autoFocus placeholder="Descreva a melhoria em uma frase" /></label>
      <div className="form-grid suggestion-form-grid">
        <label className="field"><span>Cliente</span><select name="customerId" defaultValue=""><option value="">Não vincular cliente</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name || customer.legal_name}</option>)}</select></label>
        <label className="field"><span>Prioridade *</span><select name="priorityId" required defaultValue={priorities[0]?.id ?? ""}><option value="" disabled>Selecionar...</option>{priorities.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      </div>
      <div className="suggestion-flag-options">
        <button type="button" className={strategicClient ? "selected strategic" : ""} onClick={() => setStrategicClient((current) => !current)}><span className="flag-check">{strategicClient && <Check size={14} />}</span><Sparkles size={19} /><span><strong>Cliente estratégico</strong><small>Destaca a relevância comercial desta sugestão.</small></span></button>
        <button type="button" className={cancellationRisk ? "selected risk" : ""} onClick={() => setCancellationRisk((current) => !current)}><span className="flag-check">{cancellationRisk && <Check size={14} />}</span><ShieldAlert size={19} /><span><strong>Risco de cancelamento</strong><small>Sinaliza urgência relacionada à retenção do cliente.</small></span></button>
      </div>
      <label className="field"><span>Descrição</span><textarea name="description" maxLength={6000} rows={5} placeholder="Contexto, impacto esperado e detalhes da sugestão..." /></label>
      {initialStatus && <div className="suggestion-initial-flow"><CircleDot size={17} style={{ color: initialStatus.color }} /><span>Ao criar, a sugestão entrará em <strong>{initialStatus.kanbanColumn || initialStatus.name}</strong>.</span></div>}
    </div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || !priorities.length || !initialStatus}><Plus size={17} /> Cadastrar sugestão</button></div>
  </form></div>;
}

function SuggestionDetailsModal({ suggestion, statuses, canEdit, canDelete, busy, onClose, onDelete, onStatus, onSendToDevelopment, onComment }: {
  suggestion: Suggestion; statuses: SuggestionStatus[]; canEdit: boolean; canDelete: boolean; busy: boolean; onClose: () => void; onDelete: () => void; onStatus: (statusId: string) => Promise<void>; onSendToDevelopment: () => Promise<OperationResult>; onComment: (body: string) => Promise<boolean>;
}) {
  const [comment, setComment] = useState("");
  const approved = /aprovad/i.test(`${suggestion.statusName} ${suggestion.kanbanColumn}`);
  return <div className="modal-backdrop suggestion-side-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal suggestion-detail-modal suggestion-side-panel">
    <div className="modal-header"><div><span className="eyebrow">{suggestion.protocol}</span><h2>{suggestion.name}</h2><p>Criada em {dateTime(suggestion.createdAt)}</p></div><div className="suggestion-detail-actions">{approved && canEdit && <button type="button" className="primary-button" disabled={busy} onClick={() => void onSendToDevelopment()}><ArrowRight size={16} /> Enviar para desenvolvimento</button>}<button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div></div>
    <div className="modal-body suggestion-detail-body">
      <main className="suggestion-detail-main">
      <section className="suggestion-description"><h3>Descrição da sugestão</h3><p>{suggestion.description || "Nenhuma descrição informada."}</p></section>
      <section className="suggestion-comments"><div className="suggestion-comments-title"><span><MessageSquareText size={18} /><strong>Comentários</strong></span><b>{suggestion.comments.length}</b></div>
        <div className="suggestion-comment-list">{suggestion.comments.length === 0 ? <p className="suggestion-muted">Ainda não há comentários nesta sugestão.</p> : suggestion.comments.map((entry) => <article key={entry.id}><Avatar name={entry.authorName} photo={entry.authorPhotoDataUrl} coordinator={entry.authorIsCoordinator} small /><div><header><strong>{entry.authorName}</strong><time>{dateTime(entry.createdAt)}</time></header><p>{entry.body}</p></div></article>)}</div>
        <form className="suggestion-comment-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (await onComment(comment)) setComment(""); }}><textarea value={comment} onChange={(event) => setComment(event.target.value)} required maxLength={3000} rows={3} placeholder="Escreva um comentário para a equipe..." /><button className="primary-button" disabled={busy || !comment.trim()}><MessageSquareText size={16} /> Comentar</button></form>
      </section>
      </main>
      <aside className="suggestion-detail-sidebar">
      <div className="suggestion-detail-summary">
        <div><small>Status</small>{canEdit ? <select value={suggestion.statusId} disabled={busy} onChange={(event) => void onStatus(event.target.value)}>{statuses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select> : <span className="suggestion-color-badge" style={{ "--badge-color": suggestion.statusColor } as CSSProperties}>{suggestion.statusName}</span>}</div>
        <div><small>Prioridade</small><span className="suggestion-color-badge" style={{ "--badge-color": suggestion.priorityColor } as CSSProperties}>{suggestion.priorityName}</span></div>
        <div><small>Cliente</small><strong>{suggestion.customerName}</strong></div>
        <div><small>Responsável</small><span className="suggestion-owner"><Avatar name={suggestion.responsibleName} photo={suggestion.responsiblePhotoDataUrl} coordinator={suggestion.responsibleIsCoordinator} small /><strong>{suggestion.responsibleName}</strong></span></div>
      </div>
      <FlagBadges suggestion={suggestion} />
      <div className="suggestion-side-actions">{canDelete && <button type="button" className="secondary-button danger-action" disabled={busy} onClick={onDelete}><Trash2 size={16} /> Excluir sugestão</button>}</div>
      </aside>
    </div>
  </div></div>;
}

export function SuggestionCatalogsModule({ module, busy, operate }: { module: SuggestionModuleData; busy: boolean; operate: Operate }) {
  const [section, setSection] = useState<"priorities" | "statuses">("priorities");
  const [editingPriority, setEditingPriority] = useState<SuggestionPriority | null | undefined>(undefined);
  const [editingStatus, setEditingStatus] = useState<SuggestionStatus | null | undefined>(undefined);
  const items = section === "priorities" ? module.priorities : module.statuses;
  return <section className="suggestion-catalog-page">
    <header className="suggestions-header"><div><span className="eyebrow">CADASTROS · SUGESTÕES</span><h1><Settings2 size={27} /> Sugestões</h1><p>Configure as opções usadas no cadastro, nos filtros e nas colunas do Kanban.</p></div><button className="primary-button" onClick={() => section === "priorities" ? setEditingPriority(null) : setEditingStatus(null)}><Plus size={17} /> {section === "priorities" ? "Nova prioridade" : "Novo status"}</button></header>
    <div className="suggestion-schema-strip">
      <span><Hash size={16} /><small>ID</small><strong>Protocolo automático</strong></span><span><Sparkles size={16} /><small>Nome</small><strong>Informado no cadastro</strong></span><span><UserRound size={16} /><small>Responsável</small><strong>Usuário criador</strong></span><span><Flag size={16} /><small>Prioridade</small><strong>Cadastro abaixo</strong></span><span><CircleDot size={16} /><small>Status</small><strong>Cadastro abaixo</strong></span><span><Columns3 size={16} /><small>Kanban</small><strong>Ordem configurável</strong></span>
    </div>
    <div className="suggestion-catalog-tabs"><button className={section === "priorities" ? "active" : ""} onClick={() => setSection("priorities")}><Flag size={16} /> Prioridades</button><button className={section === "statuses" ? "active" : ""} onClick={() => setSection("statuses")}><Columns3 size={16} /> Status e Kanban</button></div>
    <div className="suggestion-catalog-list panel">
      <header><span>{items.length} cadastro{items.length === 1 ? "" : "s"}</span><small>As alterações são refletidas automaticamente no módulo Sugestões.</small></header>
      {items.map((item) => <article key={item.id}>
        <i style={{ background: item.color }} /><div className="suggestion-catalog-data"><strong>{item.name}</strong><small>{item.description || (isSuggestionStatus(item) ? `Coluna: ${item.kanbanColumn}` : `Ordem ${item.displayOrder}`)}</small></div>
        {isSuggestionStatus(item) && item.isInitial && <span className="suggestion-initial-badge">Etapa inicial</span>}<span className={`status-pill ${item.active ? "positive" : "negative"}`}>{item.active ? "Ativo" : "Inativo"}</span>
        <button className="catalog-icon-button" onClick={() => isSuggestionStatus(item) ? setEditingStatus(item) : setEditingPriority(item)} aria-label={`Editar ${item.name}`}><Pencil size={15} /></button>
        <button className="catalog-icon-button delete" onClick={() => void operate({ action: isSuggestionStatus(item) ? "deleteSuggestionStatus" : "deleteSuggestionPriority", id: item.id }, `${isSuggestionStatus(item) ? "Status" : "Prioridade"} excluído com sucesso.`)} aria-label={`Excluir ${item.name}`}><Trash2 size={15} /></button>
      </article>)}
    </div>
    {editingPriority !== undefined && <SuggestionPriorityModal item={editingPriority} busy={busy} onClose={() => setEditingPriority(undefined)} onSave={async (payload) => {
      const result = await operate({ action: "saveSuggestionPriority", id: editingPriority?.id, ...payload }, editingPriority ? "Prioridade atualizada com sucesso." : "Prioridade cadastrada com sucesso.");
      if (result) setEditingPriority(undefined);
    }} />}
    {editingStatus !== undefined && <SuggestionStatusModal item={editingStatus} busy={busy} onClose={() => setEditingStatus(undefined)} onSave={async (payload) => {
      const result = await operate({ action: "saveSuggestionStatus", id: editingStatus?.id, ...payload }, editingStatus ? "Status atualizado com sucesso." : "Status cadastrado com sucesso.");
      if (result) setEditingStatus(undefined);
    }} />}
  </section>;
}

function SuggestionPriorityModal({ item, busy, onClose, onSave }: { item: SuggestionPriority | null; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [color, setColor] = useState(item?.color ?? "#2563eb");
  return <CatalogConfigModal title={item ? "Editar prioridade" : "Nova prioridade"} description="Defina como a prioridade será exibida na lista e nos cards." onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ name: form.get("name"), description: form.get("description"), color, displayOrder: Number(form.get("displayOrder")), active: form.get("active") === "on" }); }}>
      <div className="modal-body"><label className="field"><span>Nome da prioridade *</span><input name="name" defaultValue={item?.name ?? ""} required maxLength={80} autoFocus placeholder="Ex.: Alta" /></label><label className="field"><span>Descrição *</span><textarea name="description" defaultValue={item?.description ?? ""} required maxLength={600} rows={3} placeholder="Explique quando utilizar esta prioridade." /></label><div className="form-grid"><ColorField color={color} onColor={setColor} /><label className="field"><span>Ordem de exibição</span><input name="displayOrder" type="number" min={0} max={999} defaultValue={item?.displayOrder ?? 10} /></label></div><label className="check-row"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /><span><strong>Cadastro ativo</strong><small>Disponível para novas sugestões e filtros.</small></span></label></div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><Check size={17} /> Salvar prioridade</button></div>
    </form>
  </CatalogConfigModal>;
}

function SuggestionStatusModal({ item, busy, onClose, onSave }: { item: SuggestionStatus | null; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [color, setColor] = useState(item?.color ?? "#2563eb");
  return <CatalogConfigModal title={item ? "Editar status" : "Novo status"} description="O status também define uma etapa visual no Kanban." onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ name: form.get("name"), description: form.get("description"), kanbanColumn: form.get("kanbanColumn"), color, displayOrder: Number(form.get("displayOrder")), isInitial: form.get("isInitial") === "on", active: form.get("active") === "on" }); }}>
      <div className="modal-body"><label className="field"><span>Nome do status *</span><input name="name" defaultValue={item?.name ?? ""} required maxLength={100} autoFocus placeholder="Ex.: Em análise" /></label><label className="field"><span>Descrição *</span><textarea name="description" defaultValue={item?.description ?? ""} required maxLength={600} rows={3} placeholder="Explique o significado deste status." /></label><label className="field"><span>Título da coluna no Kanban *</span><input name="kanbanColumn" defaultValue={item?.kanbanColumn ?? ""} required maxLength={100} placeholder="Ex.: Em análise" /></label><div className="form-grid"><ColorField color={color} onColor={setColor} /><label className="field"><span>Ordem no Kanban</span><input name="displayOrder" type="number" min={0} max={999} defaultValue={item?.displayOrder ?? 10} /></label></div><div className="suggestion-config-checks"><label className="check-row"><input name="isInitial" type="checkbox" defaultChecked={item?.isInitial ?? false} /><span><strong>Etapa inicial</strong><small>Novas sugestões entram automaticamente aqui.</small></span></label><label className="check-row"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /><span><strong>Cadastro ativo</strong><small>Exibir no formulário e no Kanban.</small></span></label></div></div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><Check size={17} /> Salvar status</button></div>
    </form>
  </CatalogConfigModal>;
}

function ColorField({ color, onColor }: { color: string; onColor: (value: string) => void }) {
  return <label className="field suggestion-color-field"><span>Cor de identificação</span><span><input type="color" value={color} onChange={(event) => onColor(event.target.value)} /><strong>{color.toUpperCase()}</strong></span></label>;
}

function CatalogConfigModal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop"><div className="modal suggestion-catalog-modal"><div className="modal-header"><div><span className="eyebrow">CADASTROS · SUGESTÕES</span><h2>{title}</h2><p>{description}</p></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>{children}</div></div>;
}
