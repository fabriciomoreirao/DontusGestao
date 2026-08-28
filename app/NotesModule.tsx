"use client";

import { Copy, GripVertical, Pencil, Plus, Save, Search, StickyNote, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState, type CSSProperties, type DragEvent } from "react";

export type Note = {
  id: string;
  title: string;
  content: string;
  color: string;
  sortOrder: number;
  updatedAt: string;
};

export type NotesModuleData = { notes: Note[] };
type OperationResult = { id?: string } | false;
type Operate = (payload: Record<string, unknown>, success: string) => Promise<OperationResult>;
type EditorState = { id: string | null; title: string; content: string; color: string };

const DEFAULT_COLOR = "#7c3aed";
const emptyEditor = (): EditorState => ({ id: null, title: "", content: "", color: DEFAULT_COLOR });
const noteDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export default function NotesModule({ module, busy, operate }: { module: NotesModuleData; busy: boolean; operate: Operate }) {
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const visibleNotes = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return module.notes;
    return module.notes.filter((note) => (note.title + " " + note.content).toLocaleLowerCase("pt-BR").includes(term));
  }, [module.notes, query]);

  const copyNote = async (note: Note) => {
    try {
      await navigator.clipboard.writeText(note.title + "\n\n" + note.content);
      setCopiedId(note.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(null);
    }
  };

  const reorder = async (targetId: string) => {
    if (!draggedId || draggedId === targetId || busy) return;
    const ordered = [...module.notes];
    const from = ordered.findIndex((note) => note.id === draggedId);
    const to = ordered.findIndex((note) => note.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    const result = await operate({ action: "reorderNotes", noteIds: ordered.map((note) => note.id) }, "Anotações reorganizadas com sucesso.");
    if (result) setDraggedId(null);
  };

  const saveNote = async (payload: EditorState) => {
    const result = await operate(
      { action: "saveNote", id: payload.id, title: payload.title, description: payload.content, color: payload.color },
      payload.id ? "Anotação atualizada com sucesso." : "Anotação criada com sucesso.",
    );
    if (result) setEditor(null);
  };

  return <>
    <div className="page-header notes-header">
      <div><span className="eyebrow">MÓDULO PESSOAL</span><h1><StickyNote size={22} /> Anotações</h1><p>{module.notes.length} {module.notes.length === 1 ? "anotação" : "anotações"} · arraste os cartões para reorganizar.</p></div>
      <button className="primary-button" onClick={() => setEditor(emptyEditor())}><Plus size={17} /> Nova anotação</button>
    </div>

    <div className="notes-toolbar">
      <label className="notes-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar anotações..." /></label>
      {module.notes.length > 1 && <span>Arraste pelo ícone para organizar</span>}
    </div>

    {visibleNotes.length === 0 ? <div className="notes-empty"><StickyNote size={30} /><strong>{query ? "Nenhuma anotação encontrada" : "Comece sua coleção de anotações"}</strong><p>{query ? "Tente outra palavra na busca." : "Registre informações, modelos e lembretes importantes para o seu dia."}</p>{!query && <button className="primary-button" onClick={() => setEditor(emptyEditor())}><Plus size={16} /> Criar primeira anotação</button>}</div> : <section className="notes-grid">
      {visibleNotes.map((note) => <NoteCard key={note.id} note={note} busy={busy} dragging={draggedId === note.id} copied={copiedId === note.id}
        onEdit={() => setEditor({ id: note.id, title: note.title, content: note.content, color: note.color })}
    onCopy={() => void copyNote(note)}
        onDuplicate={() => void operate({ action: "duplicateNote", id: note.id }, "Anotação duplicada com sucesso.")}
        onDelete={() => void operate({ action: "deleteNote", id: note.id }, "Anotação excluída com sucesso.")}
        onDragStart={(event) => { if (busy) return; event.dataTransfer.effectAllowed = "move"; setDraggedId(note.id); }}
        onDragEnd={() => setDraggedId(null)}
        onDrop={() => void reorder(note.id)}
      />)}
    </section>}

    {editor && <NoteEditor editor={editor} busy={busy} onClose={() => setEditor(null)} onSave={saveNote} />}
  </>;
}

function NoteCard({ note, busy, dragging, copied, onEdit, onCopy, onDuplicate, onDelete, onDragStart, onDragEnd, onDrop }: {
  note: Note; busy: boolean; dragging: boolean; copied: boolean; onEdit: () => void; onCopy: () => void; onDuplicate: () => void; onDelete: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void; onDragEnd: () => void; onDrop: () => void;
}) {
  const prevent = (event: DragEvent<HTMLElement>) => event.preventDefault();
  return <article className={["note-card", dragging ? "dragging" : ""].filter(Boolean).join(" ")} style={{ "--note-color": note.color } as CSSProperties} draggable={!busy} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={prevent} onDrop={onDrop} onDoubleClick={onEdit}>
    <div className="note-card-head"><button className="note-drag-handle" aria-label="Arrastar anotação" title="Arraste para reorganizar" onClick={(event) => event.stopPropagation()}><GripVertical size={17} /></button><div className="note-card-actions"><button onClick={(event) => { event.stopPropagation(); onCopy(); }} title="Copiar conteúdo"><Copy size={15} /><span>{copied ? "Copiado" : "Copiar"}</span></button><button onClick={(event) => { event.stopPropagation(); onDuplicate(); }} disabled={busy} title="Duplicar anotação"><Copy size={15} /></button><button onClick={(event) => { event.stopPropagation(); onEdit(); }} title="Editar anotação"><Pencil size={15} /></button><button className="delete" onClick={(event) => { event.stopPropagation(); onDelete(); }} disabled={busy} title="Excluir anotação"><Trash2 size={15} /></button></div></div>
    <button className="note-card-body" onClick={onEdit}><strong>{note.title}</strong><span className="note-color-label"><i />{note.color.toUpperCase()}</span><p>{note.content || "Sem conteúdo. Clique para registrar os detalhes."}</p></button>
    <footer>Atualizada {noteDate(note.updatedAt)} <button onClick={onEdit}>Editar</button></footer>
  </article>;
}

function NoteEditor({ editor, busy, onClose, onSave }: { editor: EditorState; busy: boolean; onClose: () => void; onSave: (payload: EditorState) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ id: editor.id, title: String(form.get("title") ?? ""), content: String(form.get("content") ?? ""), color: String(form.get("color") ?? DEFAULT_COLOR) });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><div className="modal note-editor" role="dialog" aria-modal="true" aria-label={editor.id ? "Editar anotação" : "Nova anotação"}><div className="modal-head"><div><span className="eyebrow">ANOTAÇÕES</span><h2>{editor.id ? "Editar anotação" : "Nova anotação"}</h2><p>Esta anotação é visível somente para você.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div><form className="form-grid" onSubmit={submit}><label className="wide">Título *<input name="title" defaultValue={editor.title} required maxLength={240} autoFocus placeholder="Título da anotação" /></label><label className="wide">Conteúdo<textarea name="content" defaultValue={editor.content} rows={7} placeholder="Escreva sua anotação..." /></label><label className="wide note-color-field">Cor<div><input name="color" type="color" defaultValue={editor.color} aria-label="Selecionar cor da anotação" /><span><strong>Selecionar cor do cartão</strong><small>Escolha qualquer cor para identificar esta anotação.</small></span></div></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy}><Save size={16} /> {busy ? "Salvando..." : editor.id ? "Salvar alterações" : "Criar anotação"}</button></div></form></div></div>;
}
