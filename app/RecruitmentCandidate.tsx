"use client";

import { BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronRight, Clock3, Copy, Download, FileText, Mail, MessageSquareText, Phone, Save, X } from "lucide-react";
import { useState } from "react";
import { cardShareUrl } from "@/app/CardLinkEnhancer";
import ReminderAction, { openAgendaComposer } from "@/app/ReminderAction";

type Candidate = {
  id: string; title: string; description: string; status: string; customer_name: string;
  owner: string; team: string; record_type: string; priority: string; amount_cents: number;
  version: number; created_at: string;
};
type CandidateDetails = { vacancy?: string; sector?: string; notes?: string; comments?: string[]; curriculumName?: string; curriculumData?: string };
type Operate = (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>;

function details(candidate: Candidate): CandidateDetails {
  try { return JSON.parse(candidate.description) ?? {}; } catch { return {}; }
}
function initials(name: string) { return name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).filter((_, index, all) => index === 0 || index === all.length - 1).join("").toUpperCase(); }
function receivedAt(value: string, withTime = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(date);
}

export function RecruitmentCandidateCard({ candidate, busy, onSelect }: { candidate: Candidate; busy: boolean; onSelect: () => void }) {
  const payload = details(candidate);
  return <article className="recruitment-candidate candidate-application-card" data-reminder-entity-id={candidate.id} role="button" tabIndex={0}
    aria-label={`Ver candidatura de ${candidate.title}`} draggable={!busy}
    onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-dontus-candidate", candidate.id); }}
    onClick={onSelect} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}>
    <div className="candidate-card-heading"><span className="candidate-avatar" aria-hidden="true">{initials(candidate.title)}</span><span className="candidate-card-identity"><strong>{candidate.title}</strong><small>{payload.vacancy || "Candidatura recebida"}</small></span><span className="candidate-card-grip" aria-hidden="true">⠿</span></div>
    <div className="candidate-card-contact"><span><Mail size={14}/><span>{candidate.customer_name || "E-mail não informado"}</span></span><span><Phone size={14}/><span>{candidate.owner || "Telefone não informado"}</span></span></div>
    <div className={`candidate-card-document ${payload.curriculumData ? "received" : ""}`}><FileText size={14}/><span>{payload.curriculumData ? "Currículo recebido" : "Currículo não anexado"}</span>{payload.curriculumData && <CheckCircle2 size={13}/>}</div>
    <footer><span><Clock3 size={13}/><time dateTime={candidate.created_at}>{receivedAt(candidate.created_at)}</time></span><span className="candidate-card-open">Ver inscrição<ChevronRight size={14}/></span></footer>
  </article>;
}

export function CandidateDrawer({ candidate, stages, busy, onClose, onOperate }: { candidate: Candidate; stages: string[]; busy: boolean; onClose: () => void; onOperate: Operate }) {
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);
  const payload = details(candidate);
  const comments = Array.isArray(payload.comments) ? payload.comments : [];
  const phone = candidate.owner.replace(/\D/g, "");
  const context = { module: "admin", entityId: candidate.id, title: candidate.title, summary: payload.vacancy || candidate.team };
  const stageOptions = [...new Set([candidate.status, ...stages])].filter(Boolean);
  const save = async (stage?: string) => {
    const result = stage
      ? await onOperate({ action: "transitionWorkItem", id: candidate.id, nextStatus: stage, version: candidate.version, confirmed: true }, "Etapa do candidato atualizada.")
      : await onOperate({ action: "updateWorkItem", id: candidate.id, module: "admin", recordType: candidate.record_type, title: candidate.title, customerName: candidate.customer_name, owner: candidate.owner, team: candidate.team, priority: candidate.priority, amountCents: candidate.amount_cents, description: JSON.stringify({ ...payload, comments: comment.trim() ? [...comments, comment.trim()] : comments }), version: candidate.version }, "Candidato atualizado com sucesso.");
    if (result) { setComment(""); if (stage) onClose(); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(cardShareUrl("admin", candidate.id)); setCopied(true); }
    catch { setCopied(false); }
  };
  return <div className="drawer-backdrop candidate-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="drawer recruitment-candidate-drawer" role="dialog" aria-modal="true" aria-labelledby="candidate-detail-title">
      <header className="drawer-head candidate-detail-head">
        <div className="candidate-detail-heading"><span className="eyebrow">PROCESSO SELETIVO · INSCRIÇÃO</span><div className="candidate-detail-identity"><span className="candidate-avatar" aria-hidden="true">{initials(candidate.title)}</span><div><h2 id="candidate-detail-title">{candidate.title}</h2><p><BriefcaseBusiness size={14}/>{payload.vacancy || candidate.team || "Candidatura"}</p></div></div><div className="candidate-application-meta"><span className="candidate-stage-badge">{candidate.status}</span><span><CalendarDays size={13}/>Recebida em {receivedAt(candidate.created_at, true)}</span></div></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19}/></button>
        <div className="detail-header-actions candidate-header-actions"><button type="button" className="copy-task-link" onClick={() => void copyLink()}><Copy size={14}/>{copied ? "Link copiado" : "Copiar link"}</button><ReminderAction context={context} compact={false}/><button type="button" className="agenda-detail-action" onClick={() => openAgendaComposer(context)}><CalendarDays size={14}/>Agendar</button></div>
      </header>
      <div className="candidate-detail-body">
        <section className="candidate-detail-panel"><div className="candidate-section-title"><span><Mail size={17}/>Dados de contato</span></div><dl className="candidate-contact-grid"><div><dt>E-mail</dt><dd>{candidate.customer_name ? <a href={`mailto:${candidate.customer_name}`}>{candidate.customer_name}</a> : "Não informado"}</dd></div><div><dt>Celular / WhatsApp</dt><dd>{candidate.owner || "Não informado"}</dd></div><div><dt>Vaga</dt><dd>{payload.vacancy || "Não informada"}</dd></div><div><dt>Setor</dt><dd>{payload.sector || candidate.team || "Não informado"}</dd></div></dl>{phone && <a className="candidate-whatsapp-link" href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"><MessageSquareText size={15}/>Abrir WhatsApp<ChevronRight size={14}/></a>}</section>
        <section className="candidate-detail-panel"><div className="candidate-section-title"><span><FileText size={17}/>Currículo e apresentação</span></div>{payload.curriculumData ? <div className="candidate-document"><span className="candidate-document-icon"><FileText size={22}/></span><span><strong>{payload.curriculumName || "Currículo do candidato"}</strong><small>Documento enviado na inscrição</small></span><a className="secondary-button" href={payload.curriculumData} download={payload.curriculumName || "curriculo"}><Download size={15}/>Baixar currículo</a></div> : <p className="candidate-empty-note">Nenhum currículo anexado a esta inscrição.</p>}{payload.notes && <div className="candidate-application-notes"><h4>Observações do candidato</h4><p>{payload.notes}</p></div>}</section>
        <section className="candidate-detail-panel"><div className="candidate-section-title"><span><BriefcaseBusiness size={17}/>Acompanhamento da candidatura</span></div><label className="candidate-field">Etapa atual<select value={candidate.status} disabled={busy} onChange={event => void save(event.target.value)}>{stageOptions.map(stage => <option key={stage}>{stage}</option>)}</select></label><label className="candidate-field">Feedback interno<textarea value={comment} disabled={busy} onChange={event => setComment(event.target.value)} rows={4} placeholder="Registre observações sobre este candidato."/></label><div className="candidate-feedback-actions"><button type="button" className="primary-button" disabled={busy || !comment.trim()} onClick={() => void save()}><Save size={15}/>{busy ? "Salvando..." : "Salvar comentário"}</button></div></section>
        <section className="candidate-detail-panel"><div className="candidate-section-title"><span><Clock3 size={17}/>Histórico</span><b>{comments.length} comentário(s)</b></div><div className="candidate-timeline">{comments.map((entry, index) => <article key={`${candidate.id}-${index}`}><span className="candidate-timeline-icon"><MessageSquareText size={15}/></span><div><strong>Comentário {index + 1}</strong><p>{entry}</p></div></article>)}<article><span className="candidate-timeline-icon received"><CheckCircle2 size={15}/></span><div><strong>Inscrição recebida</strong><time dateTime={candidate.created_at}>{receivedAt(candidate.created_at, true)}</time></div></article></div></section>
      </div>
    </aside>
  </div>;
}
