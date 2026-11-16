"use client";

import { Network, Send, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import useDialogFocus from "@/app/useDialogFocus";

type TransferTask = { protocol: string; title: string; departmentName: string; currentDepartmentId: string; assigneeUserId: string | null };
type Department = { id: string; name: string; active: boolean; requiresAssigneeOnTransfer: boolean };
type Collaborator = { id: string; name: string };

export default function TaskTransferModal({ task, departments, collaborators, canChangeAssignee, busy, onClose, onTransfer }: {
  task: TransferTask; departments: Department[]; collaborators: Collaborator[]; canChangeAssignee: boolean; busy: boolean;
  onClose: () => void;
  onTransfer: (payload: { departmentId: string; assigneeUserId: string | null; reason: string }) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLElement>(null);
  const submitting = useRef(false);
  const destinations = departments.filter(department => department.active && department.id !== task.currentDepartmentId);
  const [departmentId, setDepartmentId] = useState(destinations[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState(task.assigneeUserId ?? "");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const pending = busy || sending;
  const requiresAssignee = destinations.find(department => department.id === departmentId)?.requiresAssigneeOnTransfer;
  useDialogFocus(dialog, onClose);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || submitting.current || !departmentId || !reason.trim() || requiresAssignee && !assigneeId) return;
    submitting.current = true;
    setSending(true);
    try { await onTransfer({ departmentId, assigneeUserId: assigneeId || null, reason: reason.trim() }); }
    finally { submitting.current = false; setSending(false); }
  };
  const host = typeof document === "undefined" ? null : document.querySelector(".app-shell") ?? document.body;
  return host ? createPortal(<div className="modal-backdrop task-transfer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} className="modal task-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="task-transfer-title" aria-describedby="task-transfer-description" data-detail-enhancement="disabled">
      <header className="modal-head"><div><span className="eyebrow">{task.protocol} · TRANSFERÊNCIA DE SETOR</span><h2 id="task-transfer-title"><Network size={20}/> Encaminhar tarefa</h2><p id="task-transfer-description">A tarefa sairá de {task.departmentName} e entrará na etapa inicial do setor de destino.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar encaminhamento"><X size={20}/></button></header>
      <form className="task-transfer-form" onSubmit={submit}>
        <p className="task-transfer-context">{task.title}</p>
        <label>Setor de destino *<select required disabled={pending} value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Selecionar setor</option>{destinations.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        <label>Novo responsável{requiresAssignee ? " *" : ""}<SearchablePeopleSelect searchLabel="Novo responsável" required={requiresAssignee} disabled={pending || !canChangeAssignee} value={assigneeId} onChange={event => setAssigneeId(event.target.value)}><option value="">Fila compartilhada</option>{collaborators.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</SearchablePeopleSelect></label>
        <label>Motivo *<textarea required rows={4} readOnly={pending} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explique o encaminhamento"/></label>
        <footer><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={pending || !departmentId || !reason.trim() || Boolean(requiresAssignee && !assigneeId)}><Send size={16}/>{sending ? "Encaminhando..." : "Encaminhar tarefa"}</button></footer>
      </form>
    </section>
  </div>, host) : null;
}
