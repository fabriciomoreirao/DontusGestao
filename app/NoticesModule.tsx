"use client";

import {
  Bell, CalendarDays, CheckCheck, Eye, ImagePlus, Info, Megaphone,
  Pencil, Plus, Power, Trash2, TriangleAlert, UserRound, Users, X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

export type NoticeRecipientStatus = {
  userId: string;
  userName: string;
  photoDataUrl: string;
  viewedAt: string | null;
  confirmedAt: string | null;
};

export type CompanyNotice = {
  id: string;
  title: string;
  body: string;
  type: "Informativo" | "Importante" | "Urgente";
  kind: "Aviso" | "Evento";
  audience: "Todos" | "Colaborador";
  targetUserId: string | null;
  targetUserName: string;
  authorUserId: string;
  authorName: string;
  imageDataUrl: string;
  publishedAt: string;
  eventAt: string | null;
  expiresAt: string | null;
  active: boolean;
  visibleToCurrentUser: boolean;
  isRead: boolean;
  viewedAt: string | null;
  readAt: string | null;
  viewedCount: number;
  readCount: number;
  recipients: NoticeRecipientStatus[];
  updatedAt: string;
};

export type NoticesModuleData = { notices: CompanyNotice[] };
export type NoticeEmployee = { id: string; displayName: string; photoDataUrl: string; active: boolean };

type Operate = (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>;

const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "—";

const inputDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const audienceLabel = (notice: CompanyNotice) => notice.audience === "Colaborador" ? notice.targetUserName : "Toda a empresa";
const confirmationLabel = (notice: CompanyNotice) => notice.kind === "Evento" ? "Confirmar presença" : "Confirmar leitura";
const taskLink = (notice: CompanyNotice) => notice.body.match(/\[TASK_LINK:([^\]]+)\]/)?.[1] ?? "";
const visibleBody = (notice: CompanyNotice) => notice.body.replace(/\s*\[TASK_LINK:[^\]]+\]/g, "").trim();
const openTask = (notice: CompanyNotice) => {
  const link = taskLink(notice);
  if (link) window.location.href = link;
};

function NoticeIcon({ type, kind }: { type: CompanyNotice["type"]; kind?: CompanyNotice["kind"] }) {
  if (kind === "Evento") return <CalendarDays size={18} />;
  if (type === "Urgente") return <TriangleAlert size={18} />;
  if (type === "Importante") return <Megaphone size={18} />;
  return <Info size={18} />;
}

export default function NoticesModule({ module, busy, operate }: { module: NoticesModuleData; busy: boolean; operate: Operate }) {
  const visible = useMemo(() => module.notices.filter((notice) => notice.active && notice.visibleToCurrentUser), [module.notices]);
  const unread = useMemo(() => visible.filter((notice) => !notice.isRead), [visible]);
  const read = useMemo(() => visible.filter((notice) => notice.isRead), [visible]);
  return <div className="notices-module">
    <header className="notices-page-header module-page-header"><div className="notices-title-icon module-page-title-icon"><Megaphone size={21} /></div><div className="module-page-copy"><span className="eyebrow">COMUNICAÇÃO INTERNA</span><h1>Avisos</h1><p>Comunicados, eventos e informações importantes para você.</p></div><span className="notices-unread-counter module-page-actions"><Bell size={15} /> {unread.length} pendente(s)</span></header>
    <NoticeSection title="Aguardando confirmação" items={unread} busy={busy} onRead={async (notice) => { await operate({ action: "markNoticeRead", id: notice.id }, notice.kind === "Evento" ? "Presença confirmada." : "Leitura do aviso confirmada."); }} />
    {read.length > 0 && <NoticeSection title="Confirmados" items={read} busy={busy} onRead={async () => false} />}
    {visible.length === 0 && <div className="notice-empty"><Megaphone size={30} /><strong>Nenhum aviso publicado</strong><p>Os comunicados destinados a você aparecerão aqui.</p></div>}
  </div>;
}

function NoticeSection({ title, items, busy, onRead }: { title: string; items: CompanyNotice[]; busy: boolean; onRead: (notice: CompanyNotice) => Promise<unknown> }) {
  if (items.length === 0 && title === "Confirmados") return null;
  return <section className="notice-section"><header><span>{title.toUpperCase()}</span><b>{items.length}</b></header><div>{items.length === 0 ? <p className="notice-section-empty">Tudo em dia. Nenhum aviso aguardando confirmação.</p> : items.map((notice) => <article className={`notice-card ${notice.type.toLowerCase()} ${notice.kind.toLowerCase()} ${notice.isRead ? "read" : ""}`} key={notice.id}>
    <span className="notice-card-icon"><NoticeIcon type={notice.type} kind={notice.kind} /></span>
    <div className="notice-card-content"><div><b>{notice.kind} · {notice.type}</b><span>{audienceLabel(notice)}</span></div><h2>{notice.title}</h2>{notice.imageDataUrl && <img className="notice-card-image" src={notice.imageDataUrl} alt={`Imagem do aviso ${notice.title}`} />}<p>{visibleBody(notice)}</p>{notice.kind === "Evento" && <strong className="notice-event-date"><CalendarDays size={14} /> {dateTime(notice.eventAt)}</strong>}<small>Publicado por {notice.authorName} em {dateTime(notice.publishedAt)}{notice.expiresAt ? ` · válido até ${dateTime(notice.expiresAt)}` : ""}</small></div>
    <div className="notice-card-actions">{taskLink(notice) && <button className="notice-open-task" onClick={() => openTask(notice)}><Eye size={16} /> Ver tarefa</button>}{!notice.isRead ? <button disabled={busy} onClick={() => void onRead(notice)}><CheckCheck size={16} /> {confirmationLabel(notice)}</button> : <span className="notice-read-label"><CheckCheck size={15} /> {notice.kind === "Evento" ? "Presença confirmada" : "Leitura confirmada"} em {dateTime(notice.readAt)}</span>}</div>
  </article>)}</div></section>;
}

export function NoticeAttentionModal({ notice, busy, onConfirm }: { notice: CompanyNotice; busy: boolean; onConfirm: () => void }) {
  return <div className="modal-backdrop notice-attention-backdrop"><section className={`notice-attention-modal ${notice.type.toLowerCase()}`} role="alertdialog" aria-modal="true" aria-label={notice.title}>
    {notice.imageDataUrl && <img src={notice.imageDataUrl} alt={`Imagem do aviso ${notice.title}`} />}
    <div className="notice-attention-content"><span className="notice-attention-icon"><NoticeIcon type={notice.type} kind={notice.kind} /></span><span className="eyebrow">{notice.kind === "Evento" ? "NOVO EVENTO" : "NOVO AVISO"}</span><h2>{notice.title}</h2><p>{visibleBody(notice)}</p>{notice.kind === "Evento" && <strong className="notice-event-date"><CalendarDays size={15} /> {dateTime(notice.eventAt)}</strong>}<small>Enviado por {notice.authorName} · {audienceLabel(notice)}</small><div className="notice-attention-actions">{taskLink(notice) && <button className="secondary-button" onClick={() => openTask(notice)}><Eye size={16} /> Ver tarefa</button>}<button className="primary-button" disabled={busy} onClick={onConfirm}><CheckCheck size={17} /> {busy ? "Confirmando..." : confirmationLabel(notice)}</button></div></div>
  </section></div>;
}

export function NoticesAdmin({ module, employees, busy, operate }: { module: NoticesModuleData; employees: NoticeEmployee[]; busy: boolean; operate: Operate }) {
  const [editing, setEditing] = useState<CompanyNotice | null | undefined>(undefined);
  const [inspecting, setInspecting] = useState<CompanyNotice | null>(null);
  const savePayload = (notice: CompanyNotice, active: boolean) => ({
    action: "saveNotice", id: notice.id, title: notice.title, body: notice.body,
    noticeType: notice.type, noticeKind: notice.kind, audience: notice.audience,
    targetUserId: notice.targetUserId, imageDataUrl: notice.imageDataUrl,
    eventAt: notice.eventAt, expiresAt: notice.expiresAt, active,
  });
  return <div className="notice-admin-module">
    <header className="notices-page-header module-page-header"><div className="notices-title-icon module-page-title-icon"><Megaphone size={21} /></div><div className="module-page-copy"><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Gerenciar avisos</h1><p>Publique comunicados ou eventos para a empresa ou para um colaborador.</p></div><div className="module-page-actions"><button className="primary-button" onClick={() => setEditing(null)}><Plus size={17} /> Novo aviso</button></div></header>
    <section className="notice-admin-summary"><div><span>Publicados</span><strong>{module.notices.length}</strong></div><div><span>Ativos</span><strong>{module.notices.filter((notice) => notice.active).length}</strong></div><div><span>Visualizações</span><strong>{module.notices.reduce((sum, notice) => sum + notice.viewedCount, 0)}</strong></div><div><span>Confirmações</span><strong>{module.notices.reduce((sum, notice) => sum + notice.readCount, 0)}</strong></div></section>
    <section className="notice-admin-list">
      {module.notices.length === 0 ? <div className="notice-empty"><Megaphone size={30} /><strong>Nenhum aviso cadastrado</strong><p>Crie o primeiro comunicado ou evento.</p></div> : module.notices.map((notice) => <article key={notice.id}><span className={`notice-card-icon ${notice.type.toLowerCase()}`}><NoticeIcon type={notice.type} kind={notice.kind} /></span><div><span>{notice.kind} · {audienceLabel(notice)}</span><strong>{notice.title}</strong><p>{notice.body}</p><small>Publicado em {dateTime(notice.publishedAt)} · {notice.viewedCount} visualização(ões) · {notice.readCount} confirmação(ões)</small></div><b className={`notice-active-state ${notice.active ? "active" : "inactive"}`}>{notice.active ? "Ativo" : "Inativo"}</b><button onClick={() => setInspecting(notice)} aria-label={`Informações de ${notice.title}`} title="Visualizações e confirmações"><Eye size={15} /></button><button className={notice.active ? "deactivate" : "activate"} onClick={() => void operate(savePayload(notice, !notice.active), notice.active ? "Aviso inativado com sucesso." : "Aviso reativado com sucesso.")} aria-label={notice.active ? `Inativar ${notice.title}` : `Ativar ${notice.title}`} title={notice.active ? "Inativar" : "Ativar"}><Power size={15} /></button><button onClick={() => setEditing(notice)} aria-label={`Editar ${notice.title}`}><Pencil size={15} /></button><button className="delete" onClick={() => void operate({ action: "deleteNotice", id: notice.id }, "Aviso excluído com sucesso.")} aria-label={`Excluir ${notice.title}`}><Trash2 size={15} /></button></article>)}
    </section>
    {editing !== undefined && <NoticeModal notice={editing} employees={employees} busy={busy} onClose={() => setEditing(undefined)} onSave={async (payload) => { const result = await operate({ action: "saveNotice", id: editing?.id, ...payload }, editing ? "Aviso atualizado com sucesso." : "Aviso publicado com sucesso."); if (result) setEditing(undefined); }} />}
    {inspecting && <NoticeInfoModal notice={module.notices.find((notice) => notice.id === inspecting.id) ?? inspecting} onClose={() => setInspecting(null)} />}
  </div>;
}

function NoticeModal({ notice, employees, busy, onClose, onSave }: { notice: CompanyNotice | null; employees: NoticeEmployee[]; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [kind, setKind] = useState<CompanyNotice["kind"]>(notice?.kind ?? "Aviso");
  const [audience, setAudience] = useState<CompanyNotice["audience"]>(notice?.audience ?? "Todos");
  const [imageDataUrl, setImageDataUrl] = useState(notice?.imageDataUrl ?? "");
  const [imageError, setImageError] = useState("");
  const selectImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setImageError("Selecione uma imagem de até 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setImageDataUrl(String(reader.result ?? "")); setImageError(""); };
    reader.onerror = () => setImageError("Não foi possível carregar a imagem.");
    reader.readAsDataURL(file);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      title: form.get("title"), body: form.get("body"), noticeType: form.get("noticeType"),
      noticeKind: kind, audience, targetUserId: audience === "Colaborador" ? form.get("targetUserId") : null,
      imageDataUrl, eventAt: kind === "Evento" && form.get("eventAt") ? new Date(String(form.get("eventAt"))).toISOString() : null,
      expiresAt: form.get("expiresAt") ? new Date(String(form.get("expiresAt"))).toISOString() : null,
      active: form.has("active"),
    });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal notice-modal" role="dialog" aria-modal="true" aria-label={notice ? "Editar aviso" : "Novo aviso"}>
    <header className="modal-header"><div><span className="eyebrow">AVISOS</span><h2>{notice ? "Editar publicação" : "Nova publicação"}</h2><p>Defina o conteúdo, o público e a confirmação esperada.</p></div><button onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
    <form onSubmit={submit}><div className="notice-form-grid"><label>Formato<select value={kind} onChange={(event) => setKind(event.target.value as CompanyNotice["kind"])}><option>Aviso</option><option>Evento</option></select></label><label>Importância<select name="noticeType" defaultValue={notice?.type ?? "Informativo"}><option>Informativo</option><option>Importante</option><option>Urgente</option></select></label><label className="wide">Título *<input name="title" required maxLength={240} defaultValue={notice?.title} placeholder="Título claro e objetivo" /></label><label className="wide">Informações do aviso *<textarea name="body" required rows={6} defaultValue={notice?.body} placeholder="Escreva todas as informações que o colaborador precisa confirmar..." /></label><label>Destinatário<select value={audience} onChange={(event) => setAudience(event.target.value as CompanyNotice["audience"])}><option value="Todos">Toda a empresa</option><option value="Colaborador">Colaborador específico</option></select></label>{audience === "Colaborador" ? <label>Colaborador<select name="targetUserId" required defaultValue={notice?.targetUserId ?? ""}><option value="">Selecione...</option>{employees.filter((employee) => employee.active).map((employee) => <option value={employee.id} key={employee.id}>{employee.displayName}</option>)}</select></label> : <div className="notice-audience-hint"><Users size={17} /><span><b>Toda a empresa</b><small>Todos os colaboradores ativos receberão.</small></span></div>}{kind === "Evento" && <label>Data e horário do evento *<input name="eventAt" type="datetime-local" required defaultValue={inputDateTime(notice?.eventAt)} /></label>}<label>Validade opcional<input name="expiresAt" type="datetime-local" defaultValue={inputDateTime(notice?.expiresAt)} /></label><label className="wide notice-image-field">Imagem opcional<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => selectImage(event.target.files?.[0])} /><small>PNG, JPG, WEBP ou GIF, até 2 MB.</small>{imageError && <em>{imageError}</em>}{imageDataUrl && <div className="notice-image-preview"><img src={imageDataUrl} alt="Prévia da imagem do aviso" /><button type="button" onClick={() => setImageDataUrl("")}><Trash2 size={14} /> Remover imagem</button></div>}</label><label className="notice-active-field"><input name="active" type="checkbox" defaultChecked={notice?.active ?? true} /> Publicação ativa</label></div><footer className="modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || Boolean(imageError)}>{busy ? "Publicando..." : notice ? "Salvar alterações" : "Publicar"}</button></footer></form>
  </section></div>;
}

function NoticeInfoModal({ notice, onClose }: { notice: CompanyNotice; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal notice-info-modal" role="dialog" aria-modal="true" aria-label={`Confirmações de ${notice.title}`}>
    <header className="modal-header"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>{notice.title}</h2><p>{notice.kind === "Evento" ? "Presenças confirmadas" : "Visualizações e leituras confirmadas"}</p></div><button onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
    <div className="notice-info-summary"><div><Eye size={17} /><span><b>{notice.viewedCount}</b><small>Visualizaram</small></span></div><div><CheckCheck size={17} /><span><b>{notice.readCount}</b><small>{notice.kind === "Evento" ? "Confirmaram presença" : "Confirmaram leitura"}</small></span></div><div><Users size={17} /><span><b>{notice.recipients.length}</b><small>Destinatários</small></span></div></div>
    <div className="notice-recipients-list">{notice.recipients.length === 0 ? <p>Nenhum destinatário disponível.</p> : notice.recipients.map((recipient) => <article key={recipient.userId}><NoticeAvatar recipient={recipient} /><div><strong>{recipient.userName}</strong><small>{recipient.viewedAt ? `Visualizou em ${dateTime(recipient.viewedAt)}` : "Ainda não visualizou"}</small></div><span className={recipient.confirmedAt ? "confirmed" : "pending"}>{recipient.confirmedAt ? <><CheckCheck size={14} /> {notice.kind === "Evento" ? "Presença confirmada" : "Leitura confirmada"}</> : "Aguardando confirmação"}</span></article>)}</div>
  </section></div>;
}

function NoticeAvatar({ recipient }: { recipient: NoticeRecipientStatus }) {
  const initials = recipient.userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className={`notice-recipient-avatar ${recipient.photoDataUrl ? "has-photo" : ""}`} style={recipient.photoDataUrl ? { backgroundImage: `url("${recipient.photoDataUrl}")` } : undefined}>{recipient.photoDataUrl ? null : initials || <UserRound size={14} />}</span>;
}
