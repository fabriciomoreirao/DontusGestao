"use client";

import { Bell, Send, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import useDialogFocus from "@/app/useDialogFocus";

type NoticeTask = {
  protocol: string; title: string; customerName: string; customerCode: string;
  assigneeUserId: string | null; assigneeName: string; departmentName: string;
};

export default function TaskClientNoticeModal({ task, message, onMessageChange, busy, onClose, onSend }: {
  task: NoticeTask; message: string; onMessageChange: (value: string) => void; busy: boolean;
  onClose: () => void; onSend: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLElement>(null);
  const submitting = useRef(false);
  const [sending, setSending] = useState(false);
  const pending = busy || sending;
  useDialogFocus(dialog, onClose);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim() || busy || submitting.current) return;
    submitting.current = true;
    setSending(true);
    try { await onSend(); }
    finally { submitting.current = false; setSending(false); }
  };
  const host = typeof document === "undefined" ? null : document.querySelector(".app-shell") ?? document.body;
  return host ? createPortal(<div className="modal-backdrop task-client-notice-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="task-client-notice-dialog" role="dialog" aria-modal="true" aria-labelledby="client-notice-title" aria-describedby="client-notice-description">
      <header className="client-notice-header">
        <span className="client-notice-icon"><Bell size={23} /></span>
        <div><span className="eyebrow">COMUNICAÇÃO COM CLIENTE</span><h2 id="client-notice-title">Avisar o cliente</h2><p id="client-notice-description">Oriente o responsável sobre o contato que precisa ser feito.</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar aviso ao cliente"><X size={20} /></button>
      </header>
      <form className="client-notice-form" onSubmit={submit}>
        <div className="client-notice-body">
          <section className="client-notice-context" aria-label="Dados do aviso">
            <div className="client-notice-task"><span>{task.protocol}</span><strong>{task.title}</strong></div>
            <dl><div><dt>Cliente</dt><dd>{task.customerName || "Cliente não vinculado"}</dd>{task.customerCode && <small>ID {task.customerCode}</small>}</div><div><dt>Quem recebe o aviso</dt><dd>{task.assigneeUserId ? task.assigneeName : "Responsável não definido"}</dd><small>{task.departmentName}</small></div></dl>
          </section>
          <label className="client-notice-message" htmlFor="client-notice-message"><span>O que precisa ser informado?</span><small id="client-notice-message-help">Descreva a atualização e o próximo passo para o cliente.</small></label>
          <textarea id="client-notice-message" aria-describedby="client-notice-message-help client-notice-delivery" autoFocus value={message} onChange={event => onMessageChange(event.target.value)} required readOnly={pending} rows={5} placeholder="Ex.: confirme a resolução da solicitação e explique ao cliente como continuar." />
          <div className="client-notice-message-meta"><span>O responsável receberá esta orientação.</span><span>{message.length.toLocaleString("pt-BR")} caracteres</span></div>
          <p className="client-notice-delivery" id="client-notice-delivery"><Bell size={16} /><span>{task.assigneeUserId ? "Este aviso é interno. O responsável fará o contato com o cliente." : "A solicitação ficará registrada na tarefa até que um responsável seja definido."}</span></p>
        </div>
        <footer className="client-notice-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={pending || !message.trim()}><Send size={16} />{pending ? "Enviando..." : "Enviar aviso"}</button></footer>
      </form>
    </section>
  </div>, host) : null;
}
