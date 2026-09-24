"use client";

import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState, type CSSProperties } from "react";

export type DiaryAgendaStatus = { id: string; name: string; color: string; active: boolean };
export type DiaryEntry = {
  id: string; source: "agenda" | "manual"; title: string; description: string; type: string;
  occursAt: string; status: string; statusColor: string; agendaStatusId: string | null; version: number | null;
};
export type DiaryModuleData = { entries: DiaryEntry[]; agendaStatuses: DiaryAgendaStatus[] };
type OperationResult = { id?: string } | false;
type Operate = (payload: Record<string, unknown>, success: string) => Promise<OperationResult>;

const manualStatuses = ["Pendente", "Em andamento", "Concluída", "Cancelada"];
const localDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const entryDateKey = (value: string) => localDateKey(new Date(value));
const dateLabel = (value: Date) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(value);
const time = (value: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const isCancelled = (status: string) => status.normalize("NFD").replace(/[^\w\s]/g, "").toLowerCase().includes("cancel");
const isFinished = (status: string) => { const value = status.normalize("NFD").replace(/[^\w\s]/g, "").toLowerCase(); return value.includes("concl") || value.includes("final") || value.includes("resolvid"); };

export default function DiaryModule({ module, busy, canCreate, canEdit, operate }: { module: DiaryModuleData; busy: boolean; canCreate: boolean; canEdit: boolean; operate: Operate }) {
  const [date, setDate] = useState(() => new Date());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const dayEntries = useMemo(() => module.entries.filter((entry) => entryDateKey(entry.occursAt) === localDateKey(date)).sort((a, b) => a.occursAt.localeCompare(b.occursAt)), [module.entries, date]);
  const pending = dayEntries.filter((entry) => !isFinished(entry.status) && !isCancelled(entry.status));
  const finished = dayEntries.filter((entry) => isFinished(entry.status));
  const cancelled = dayEntries.filter((entry) => isCancelled(entry.status));
  const changeStatus = async (entry: DiaryEntry, value: string) => {
    if (entry.source === "agenda") {
      await operate({ action: "changeAgendaCommitmentStatus", id: entry.id, agendaStatusId: value }, "Status do compromisso atualizado com sucesso.");
      return;
    }
    await operate({ action: "transitionWorkItem", id: entry.id, nextStatus: value, version: entry.version ?? 0, confirmed: true }, "Status da atividade atualizado com sucesso.");
  };
  return <>
    <header className="page-header diary-header module-page-header"><div className="module-page-title"><span className="module-page-title-icon"><ClipboardList size={21} /></span><span className="module-page-copy"><span className="eyebrow">MÓDULO · ROTINA DIÁRIA</span><h1>Diário de Bordo</h1><p>Suas atividades manuais e compromissos da agenda sob sua responsabilidade, em um único lugar.</p></span></div><div className="module-page-actions">{canCreate&&<button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Nova atividade</button>}</div></header>
    <section className="diary-date-nav"><button className="icon-button" onClick={() => setDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1))} aria-label="Dia anterior"><ChevronLeft size={18} /></button><strong>{dateLabel(date)}</strong><button className="icon-button" onClick={() => setDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1))} aria-label="Próximo dia"><ChevronRight size={18} /></button></section>
    <section className="diary-kpis"><div><b>{dayEntries.length}</b><span>Total</span></div><div><b className="pending">{pending.length}</b><span>Pendentes</span></div><div><b className="done">{finished.length}</b><span>Concluídos</span></div><div><b className="cancelled">{cancelled.length}</b><span>Cancelados</span></div></section>
    <div className="diary-columns">
      <DiaryColumn title={`Pendentes (${pending.length})`} tone="pending" entries={pending} module={module} busy={busy} canEdit={canEdit} onEdit={setEditing} onDelete={entry=>{void operate({action:"deleteWorkItem",id:entry.id},"Atividade excluída.")}} onChangeStatus={changeStatus} empty="Tudo em dia! Nenhuma atividade pendente." />
      <DiaryColumn title={`Finalizados (${finished.length})`} tone="done" entries={finished} module={module} busy={busy} canEdit={canEdit} onEdit={setEditing} onDelete={entry=>{void operate({action:"deleteWorkItem",id:entry.id},"Atividade excluída.")}} onChangeStatus={changeStatus} empty="Nenhuma atividade concluída neste dia." />
    </div>
    {cancelled.length > 0 && <section className="diary-cancelled"><h2>Cancelados ({cancelled.length})</h2>{cancelled.map((entry) => <DiaryEntryCard key={entry.id} entry={entry} module={module} busy={busy} canEdit={canEdit} onEdit={setEditing} onDelete={entry=>{void operate({action:"deleteWorkItem",id:entry.id},"Atividade excluída.")}} onChangeStatus={changeStatus} />)}</section>}
    {creating && <ManualActivityModal date={date} busy={busy} onClose={() => setCreating(false)} onSave={async (payload) => { const result = await operate({ action: "createWorkItem", module: "diary", recordType: payload.type, title: payload.title, description: payload.description, owner: "", team: "Diário de Bordo", priority: "P3", dueAt: payload.dueAt, slaDueAt: null, amountCents: 0, customerName: "" }, "Atividade adicionada com sucesso."); if (result) setCreating(false); }} />}
    {editing&&canEdit&&<ManualActivityModal date={new Date(editing.occursAt)} initial={editing} busy={busy} onClose={()=>setEditing(null)} onSave={async(payload)=>{const result=await operate({action:"updateWorkItem",requireConfirmation:true,id:editing.id,title:payload.title,owner:"",amountCents:0,version:editing.version??0,description:payload.description,dueAt:payload.dueAt},"Atividade atualizada.");if(result)setEditing(null)}}/>}
  </>;
}

function DiaryColumn({ title, tone, entries, module, busy, canEdit, onEdit, onDelete, onChangeStatus, empty }: { title: string; tone: "pending" | "done"; entries: DiaryEntry[]; module: DiaryModuleData; busy: boolean; canEdit: boolean; onEdit: (entry: DiaryEntry) => void; onDelete: (entry: DiaryEntry) => void; onChangeStatus: (entry: DiaryEntry, value: string) => Promise<void>; empty: string }) {
  return <section className={`diary-column ${tone}`}><h2>{title}</h2>{entries.length === 0 ? <div className="diary-empty"><CheckCircle2 size={25} /><p>{empty}</p></div> : entries.map((entry) => <DiaryEntryCard key={entry.id} entry={entry} module={module} busy={busy} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} onChangeStatus={onChangeStatus} />)}</section>;
}

function DiaryEntryCard({ entry, module, busy, canEdit, onEdit, onDelete, onChangeStatus }: { entry: DiaryEntry; module: DiaryModuleData; busy: boolean; canEdit: boolean; onEdit: (entry: DiaryEntry) => void; onDelete: (entry: DiaryEntry) => void; onChangeStatus: (entry: DiaryEntry, value: string) => Promise<void> }) {
  const statuses = entry.source === "agenda" ? module.agendaStatuses.filter((status) => status.active) : manualStatuses.map((name) => ({ id: name, name, color: "", active: true }));
  const value = entry.source === "agenda" ? entry.agendaStatusId ?? "" : entry.status;
  return <article className="diary-entry" style={{ "--diary-color": entry.statusColor } as CSSProperties}><span className="diary-entry-icon"><CalendarDays size={16} /></span><div className="diary-entry-content"><strong>{entry.title}</strong><small>{entry.source === "agenda" ? "Compromisso da Agenda" : entry.type} · {time(entry.occursAt)}</small>{entry.description && <p>{entry.description}</p>}</div><div className="diary-entry-status"><span>{entry.status}</span><select aria-label={`Alterar status de ${entry.title}`} value={value} disabled={busy||!canEdit} onChange={(event) => void onChangeStatus(entry, event.target.value)}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></div>{canEdit&&entry.source==="manual"&&<span className="diary-entry-actions"><button type="button" onClick={()=>onEdit(entry)} aria-label="Editar atividade" title="Editar atividade"><Pencil size={14}/></button><button type="button" className="delete" onClick={()=>onDelete(entry)} aria-label="Excluir atividade" title="Excluir atividade"><Trash2 size={14}/></button></span>}</article>;
}

function ManualActivityModal({ date, initial, busy, onClose, onSave }: { date: Date; initial?: DiaryEntry; busy: boolean; onClose: () => void; onSave: (payload: { title: string; type: string; description: string; dueAt: string }) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const due = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0); onSave({ title: String(form.get("title") ?? ""), type: String(form.get("type") ?? "Outro"), description: String(form.get("description") ?? ""), dueAt: due.toISOString() }); };
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><div className="modal diary-modal" role="dialog" aria-modal="true" aria-label={initial?"Editar atividade manual":"Nova atividade manual"}><div className="modal-head"><div><span className="eyebrow">DIÁRIO DE BORDO</span><h2>{initial?"Editar atividade manual":"Nova atividade manual"}</h2><p>Registrada para {dateLabel(date)}.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div><form className="form-grid" onSubmit={submit}><label className="wide">Título *<input name="title" required placeholder="O que precisa ser feito?" defaultValue={initial?.title} autoFocus /></label><label className="wide">Tipo<select name="type" defaultValue={initial?.type||"Outro"} disabled={Boolean(initial)}><option>Outro</option><option>Tarefa</option><option>Lembrete</option><option>Retorno</option><option>Estudo</option></select></label><label className="wide">Descrição<textarea name="description" rows={4} placeholder="Detalhes opcionais..." defaultValue={initial?.description}/></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy}><Save size={16} /> {busy ? "Salvando..." : initial?"Salvar alterações":"Criar"}</button></div></form></div></div>;
}
