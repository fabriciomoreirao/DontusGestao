"use client";

import {
  Archive, ArrowRightLeft, BarChart3, Check, ChevronRight, CirclePlus, Clock3,
  Hash, Headphones, Inbox, MessageCircleMore, MessageSquareText, MoreHorizontal,
  Paperclip, Pencil, Phone, Plus, RefreshCw, Save, Search, Send, Settings2, ShieldCheck, Star, Tag, UserCheck, Users,
  Wifi, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

export type ChatMessage = {
  id: string; conversationId: string; externalId: string; direction: string; type: string;
  body: string; internal: boolean; senderUserId: string | null; senderName: string;
  status: string; replyToMessageId: string | null; mediaUrl: string; mediaName: string;
  mediaContentType: string; deliveredAt: string | null; readAt: string | null; createdAt: string;
};
export type ChatTag = { id: string; name: string; color: string; departmentId: string | null; active: boolean };
export type ChatConversation = {
  id: string; number: number; protocol: string;
  contact: { id: string; name: string; phone: string; email: string; customerId: string | null; companyName: string; notes: string };
  channelId: string; channelName: string; departmentId: string; departmentName: string;
  queueId: string; queueName: string; assigneeUserId: string | null; assigneeName: string;
  subject: string; status: string; priority: string; favorite: boolean; unreadCount: number;
  lastMessageAt: string; firstResponseAt: string | null; closedAt: string | null; slaDueAt: string | null;
  aiSummary: string; sentiment: string; version: number; messages: ChatMessage[]; tags: ChatTag[];
  transfers: Array<{ id: string; fromDepartmentId: string; toDepartmentId: string; fromChannelId: string; toChannelId: string; reason: string; actorName: string; createdAt: string }>;
};
export type ChatModuleData = {
  conversations: ChatConversation[];
  departments: Array<{ id: string; name: string; active: boolean }>;
  users: Array<{ id: string; name: string; email: string; departmentIds: string[]; active: boolean }>;
  queues: Array<{ id: string; name: string; description: string; departmentId: string; departmentName: string; distributionStrategy: string; active: boolean }>;
  channels: Array<{ id: string; name: string; type: string; departmentId: string; departmentName: string; defaultQueueId: string | null; defaultAssigneeUserId: string | null; active: boolean; aiEnabled: boolean; allowTransfer: boolean; autoCreateTask: boolean; greetingMessage: string; awayMessage: string }>;
  whatsAppNumbers: Array<{
    id: string; channelId: string; departmentId: string; departmentName: string;
    internalName: string; displayName: string; phoneNumber: string; phoneNumberId: string;
    wabaId: string; businessManagerId: string; connectionMode: "CloudApi" | "Coexistence";
    metaAppId: string; embeddedSignupConfigId: string; apiVersion: string; status: string;
    coexistenceStatus: string; coexistenceError: string; quality: string; lastSyncAt: string | null;
    coexistenceCompletedAt: string | null; hasAccessToken: boolean; hasVerifyToken: boolean;
    hasAppSecret: boolean; active: boolean;
  }>;
  tags: ChatTag[];
  quickReplies: Array<{ id: string; shortcut: string; title: string; body: string; departmentId: string | null; active: boolean }>;
  metrics: { open: number; waiting: number; unassigned: number; closedToday: number; averageFirstResponseMinutes: number; averageResolutionMinutes: number };
};

type Props = {
  module: ChatModuleData;
  busy: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  capabilities: string[];
  operate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>;
  uploadAttachments: (conversationId: string, files: File[], internal: boolean) => Promise<boolean>;
};
type View = "inbox" | "dashboard" | "settings";
type SettingsSection = "queues" | "channels" | "whatsapp" | "tags" | "replies";

type FacebookLoginResponse = { authResponse?: { code?: string }; status?: string };
type FacebookSdk = {
  init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: {
      config_id: string;
      response_type: "code";
      override_default_response_type: true;
      extras: { setup: Record<string, never>; featureType: "whatsapp_business_app_onboarding"; sessionInfoVersion: "3" };
    },
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

async function loadFacebookSdk(appId: string, apiVersion: string) {
  if (!window.FB) {
    await new Promise<void>((resolve, reject) => {
      const initialize = () => window.FB ? resolve() : reject(new Error("O SDK da Meta não foi carregado."));
      const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", initialize, { once: true });
        window.setTimeout(initialize, 5000);
        return;
      }
      window.fbAsyncInit = initialize;
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      script.onerror = () => reject(new Error("Não foi possível carregar o SDK da Meta."));
      document.body.appendChild(script);
    });
  }
  window.FB!.init({ appId, autoLogAppEvents: true, xfbml: true, version: apiVersion });
  return window.FB!;
}

const formatTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function ChatModule({ module, busy, canCreate, canEdit, canManage, capabilities, operate, uploadAttachments }: Props) {
  const [view, setView] = useState<View>("inbox");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("queues");
  const [selectedId, setSelectedId] = useState(module.conversations[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todos");
  const [departmentId, setDepartmentId] = useState("");
  const [newConversation, setNewConversation] = useState(false);
  const [composer, setComposer] = useState("");
  const [internal, setInternal] = useState(false);
  const has = (capability: string) => canManage || capabilities.includes(capability);

  useEffect(() => {
    if (!selectedId && module.conversations[0]) setSelectedId(module.conversations[0].id);
  }, [module.conversations, selectedId]);

  const filtered = useMemo(() => module.conversations.filter((conversation) => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return (!query || `${conversation.protocol} ${conversation.contact.name} ${conversation.contact.phone} ${conversation.subject}`.toLocaleLowerCase("pt-BR").includes(query))
      && (status === "Todos" || conversation.status === status)
      && (!departmentId || conversation.departmentId === departmentId);
  }), [module.conversations, search, status, departmentId]);
  const selected = module.conversations.find((conversation) => conversation.id === selectedId) ?? filtered[0] ?? null;

  const send = async () => {
    if (!selected || !composer.trim()) return;
    const ok = await operate({ action: "sendChatMessage", conversationId: selected.id, body: composer, internal }, internal ? "Nota interna registrada." : "Mensagem enviada.");
    if (ok) setComposer("");
  };

  return <section className="chat-module">
    <header className="chat-page-head">
      <div><span className="eyebrow">ATENDIMENTO INTEGRADO</span><h1>Central omnichannel</h1><p>Conversas, setores, filas e canais em uma única operação.</p></div>
      <div className="chat-view-switch">
        <button className={view === "inbox" ? "active" : ""} onClick={() => setView("inbox")}><Inbox size={16} /> Caixa de entrada</button>
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><BarChart3 size={16} /> Indicadores</button>
        {canManage && <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings2 size={16} /> Configurações</button>}
      </div>
    </header>

    {view === "inbox" && <div className="chat-workspace">
      <aside className="chat-inbox-column">
        <div className="chat-inbox-head">
          <div><h2>Conversas</h2><span>{filtered.length} atendimentos</span></div>
          {canCreate && <button className="chat-new-button" onClick={() => setNewConversation(true)} aria-label="Novo atendimento"><Plus size={18} /></button>}
        </div>
        <label className="chat-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou protocolo" /></label>
        <div className="chat-filters">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {["Todos", "Aberta", "Em atendimento", "Aguardando cliente", "Aguardando setor", "Resolvida", "Encerrada"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">Todos os setores</option>
            {module.departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}
          </select>
        </div>
        <div className="conversation-list">
          {filtered.length === 0 && <div className="chat-empty"><MessageCircleMore size={26} /><b>Nenhuma conversa</b><span>Ajuste os filtros ou inicie um atendimento.</span></div>}
          {filtered.map((conversation) => {
            const last = conversation.messages.at(-1);
            return <button key={conversation.id} className={selected?.id === conversation.id ? "active" : ""} onClick={() => {
              setSelectedId(conversation.id);
              if (conversation.unreadCount) void operate({ action: "updateChatConversation", conversationId: conversation.id, markRead: true, version: conversation.version }, "Conversa marcada como lida.");
            }}>
              <span className="chat-avatar">{initials(conversation.contact.name)}</span>
              <span className="conversation-copy">
                <span><strong>{conversation.contact.name}</strong><time>{formatTime(conversation.lastMessageAt)}</time></span>
                <b>{conversation.subject}</b>
                <small>{last?.internal ? "Nota interna: " : ""}{last?.body ?? "Atendimento iniciado"}</small>
                <em><i>{conversation.departmentName}</i><i>{conversation.channelName}</i></em>
              </span>
              {conversation.unreadCount > 0 && <b className="unread-badge">{conversation.unreadCount}</b>}
            </button>;
          })}
        </div>
      </aside>

      <main className="chat-thread-column">
        {!selected ? <div className="chat-thread-empty"><MessageSquareText size={42} /><h2>Selecione uma conversa</h2><p>O histórico completo aparecerá aqui.</p></div> : <>
          <header className="chat-thread-head">
            <div className="chat-avatar large">{initials(selected.contact.name)}</div>
            <div><h2>{selected.contact.name}</h2><p>{selected.protocol} · {selected.channelName}</p></div>
            <span className={`conversation-status ${selected.status.toLowerCase().replaceAll(" ", "-")}`}>{selected.status}</span>
            {canEdit && <button className={selected.favorite ? "favorite active" : "favorite"} onClick={() => operate({ action: "updateChatConversation", conversationId: selected.id, favorite: !selected.favorite, version: selected.version }, selected.favorite ? "Removida dos favoritos." : "Adicionada aos favoritos.")}><Star size={18} fill={selected.favorite ? "currentColor" : "none"} /></button>}
            <button><MoreHorizontal size={19} /></button>
          </header>
          <div className="chat-context-strip">
            <span><Hash size={14} /> {selected.queueName}</span>
            <span><UserCheck size={14} /> {selected.assigneeName || "Não atribuído"}</span>
            <span><Clock3 size={14} /> SLA {selected.slaDueAt ? formatDate(selected.slaDueAt) : "não definido"}</span>
          </div>
          <div className="message-timeline">
            <div className="timeline-start">Atendimento iniciado em {formatDate(selected.messages[0]?.createdAt ?? selected.lastMessageAt)}</div>
            {selected.messages.map((message) => <article key={message.id} className={`${message.internal ? "internal" : message.direction === "Saida" ? "outbound" : "inbound"}`}>
              <div className="message-meta"><strong>{message.senderName || (message.direction === "Entrada" ? selected.contact.name : "Equipe Dontus")}</strong><span>{message.internal ? "Nota interna" : message.direction}</span><time>{formatTime(message.createdAt)}</time></div>
              <p>{message.body}</p>
              {message.mediaName && <a className="message-file" href={`/api/chat-files/${message.id}`} target="_blank" rel="noreferrer"><Paperclip size={14} /><span><b>{message.mediaName}</b><small>{message.mediaContentType || "Arquivo"}</small></span></a>}
              {!message.internal && message.direction === "Saida" && <small><Check size={12} /> {message.status}</small>}
            </article>)}
            {selected.transfers.map((transfer) => <div className="transfer-event" key={transfer.id}><ArrowRightLeft size={15} /><span><b>Transferência de setor</b>{transfer.reason} · por {transfer.actorName}</span><time>{formatDate(transfer.createdAt)}</time></div>)}
          </div>
          {canEdit && <footer className={`chat-composer ${internal ? "internal" : ""}`}>
            <div className="composer-mode">
              <button className={!internal ? "active" : ""} onClick={() => setInternal(false)} disabled={!has("sendMessages")}><MessageCircleMore size={15} /> Responder</button>
              <button className={internal ? "active" : ""} onClick={() => setInternal(true)} disabled={!has("internalNotes")}><ShieldCheck size={15} /> Nota interna</button>
              <select aria-label="Resposta rápida" value="" onChange={(event) => {
                const reply = module.quickReplies.find((item) => item.id === event.target.value);
                if (reply) setComposer(reply.body);
              }}><option value="">Respostas rápidas</option>{module.quickReplies.filter((item) => item.active && (!item.departmentId || item.departmentId === selected.departmentId)).map((reply) => <option value={reply.id} key={reply.id}>{reply.shortcut} · {reply.title}</option>)}</select>
            </div>
            <textarea rows={4} value={composer} onChange={(event) => setComposer(event.target.value)} placeholder={internal ? "Escreva uma nota visível apenas para a equipe…" : "Digite sua mensagem para o cliente…"} onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(); }
            }} />
            <div className="composer-actions"><span>Ctrl + Enter para enviar</span><div><label className="composer-attachment"><Paperclip size={16} /><span>Anexar</span><input type="file" multiple onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) void uploadAttachments(selected.id, files, internal);
              event.target.value = "";
            }} /></label><button disabled={busy || !composer.trim()} onClick={() => void send()}><Send size={16} /> {internal ? "Salvar nota" : "Enviar mensagem"}</button></div></div>
          </footer>}
        </>}
      </main>

      {selected && <ConversationDetails conversation={selected} module={module} busy={busy} canEdit={canEdit} has={has} operate={operate} />}
    </div>}

    {view === "dashboard" && <ChatDashboard module={module} />}
    {view === "settings" && canManage && <ChatSettings module={module} section={settingsSection} onSection={setSettingsSection} busy={busy} has={has} operate={operate} />}
    {newConversation && <NewConversationModal module={module} busy={busy} onClose={() => setNewConversation(false)} onSubmit={async (payload) => {
      const result = await operate({ action: "createChatConversation", ...payload }, "Atendimento criado.");
      if (result) { setNewConversation(false); if (result.id) setSelectedId(result.id); }
    }} />}
  </section>;
}

function ConversationDetails({ conversation, module, busy, canEdit, has, operate }: {
  conversation: ChatConversation; module: ChatModuleData; busy: boolean; canEdit: boolean;
  has: (capability: string) => boolean;
  operate: Props["operate"];
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [toDepartmentId, setToDepartmentId] = useState("");
  const destinationChannels = module.channels.filter((channel) => channel.active && channel.departmentId === toDepartmentId);
  const destinationQueues = module.queues.filter((queue) => queue.active && queue.departmentId === toDepartmentId);
  const assignable = module.users.filter((user) => user.departmentIds.includes(conversation.departmentId));
  return <aside className="chat-detail-column">
    <div className="contact-card">
      <span className="chat-avatar xl">{initials(conversation.contact.name)}</span>
      <h3>{conversation.contact.name}</h3><p>{conversation.contact.companyName || "Contato sem empresa vinculada"}</p>
      <div><a href={`tel:${conversation.contact.phone}`}><Phone size={14} /> {conversation.contact.phone || "Sem telefone"}</a><span>{conversation.contact.email || "Sem e-mail"}</span></div>
    </div>
    <div className="detail-block"><h4>Atendimento</h4>
      <label>Status<select disabled={!canEdit} value={conversation.status} onChange={(event) => void operate({ action: "updateChatConversation", conversationId: conversation.id, status: event.target.value, version: conversation.version }, "Status atualizado.")}>
        {["Aberta", "Em atendimento", "Aguardando cliente", "Aguardando setor", "Resolvida", "Encerrada"].map((item) => <option key={item}>{item}</option>)}
      </select></label>
      <label>Prioridade<select disabled={!canEdit} value={conversation.priority} onChange={(event) => void operate({ action: "updateChatConversation", conversationId: conversation.id, priority: event.target.value, version: conversation.version }, "Prioridade atualizada.")}>
        {["Baixa", "Normal", "Alta", "Urgente"].map((item) => <option key={item}>{item}</option>)}
      </select></label>
      <label>Responsável<select disabled={!canEdit || !has("assign")} value={conversation.assigneeUserId ?? ""} onChange={(event) => void operate({ action: "assignChatConversation", conversationId: conversation.id, assigneeUserId: event.target.value || null, queueId: conversation.queueId, version: conversation.version }, "Responsável atualizado.")}>
        <option value="">Assumir atendimento</option>{assignable.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}
      </select></label>
    </div>
    <div className="detail-block"><h4>Etiquetas</h4><div className="conversation-tags">
      {module.tags.filter((tag) => tag.active && (!tag.departmentId || tag.departmentId === conversation.departmentId)).map((tag) => {
        const applied = conversation.tags.some((item) => item.id === tag.id);
        return <button disabled={!canEdit} className={applied ? "applied" : ""} key={tag.id} onClick={() => operate({ action: "setChatTag", conversationId: conversation.id, tagId: tag.id, remove: applied }, applied ? "Etiqueta removida." : "Etiqueta aplicada.")}><i style={{ background: tag.color }} />{tag.name}{applied && <X size={12} />}</button>;
      })}
    </div></div>
    {conversation.aiSummary && <div className="detail-block ai-summary"><h4>Resumo inteligente</h4><p>{conversation.aiSummary}</p><span>Sentimento: {conversation.sentiment}</span></div>}
    {canEdit && has("transfer") && <div className="detail-block transfer-block"><button className="transfer-toggle" onClick={() => setTransferOpen((current) => !current)}><ArrowRightLeft size={16} /> Transferir atendimento <ChevronRight size={15} /></button>
      {transferOpen && <form onSubmit={async (event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        const result = await operate({ action: "transferChatConversation", conversationId: conversation.id, toDepartmentId, toChannelId: form.get("toChannelId"), toQueueId: form.get("toQueueId"), assigneeUserId: form.get("assigneeUserId") || null, reason: form.get("reason"), version: conversation.version }, "Atendimento transferido.");
        if (result) setTransferOpen(false);
      }}>
        <select required value={toDepartmentId} onChange={(event) => setToDepartmentId(event.target.value)}><option value="">Setor de destino</option>{module.departments.filter((item) => item.id !== conversation.departmentId && item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <select name="toChannelId" required><option value="">Canal oficial</option>{destinationChannels.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <select name="toQueueId" required><option value="">Fila</option>{destinationQueues.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <select name="assigneeUserId"><option value="">Fila compartilhada</option>{module.users.filter((user) => user.departmentIds.includes(toDepartmentId)).map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select>
        <textarea name="reason" required rows={3} placeholder="Motivo da transferência" />
        <button disabled={busy}>Confirmar transferência</button>
      </form>}
    </div>}
  </aside>;
}

function ChatDashboard({ module }: { module: ChatModuleData }) {
  const cards = [
    ["Conversas abertas", module.metrics.open, Inbox, "blue"],
    ["Aguardando cliente", module.metrics.waiting, Clock3, "amber"],
    ["Sem responsável", module.metrics.unassigned, Users, "violet"],
    ["Encerradas hoje", module.metrics.closedToday, Archive, "green"],
  ] as const;
  const byDepartment = module.departments.map((department) => ({ ...department, count: module.conversations.filter((item) => item.departmentId === department.id && item.status !== "Encerrada").length }));
  const max = Math.max(1, ...byDepartment.map((item) => item.count));
  return <div className="chat-dashboard">
    <div className="chat-metric-grid">{cards.map(([label, value, Icon, tone]) => <article className={tone} key={label}><span><Icon size={20} /></span><div><strong>{value}</strong><p>{label}</p></div></article>)}</div>
    <div className="chat-analytics-grid">
      <article className="panel"><header><div><span className="eyebrow">DESEMPENHO</span><h3>Tempo de atendimento</h3></div></header><div className="time-metrics"><div><strong>{module.metrics.averageFirstResponseMinutes} min</strong><span>Primeira resposta média</span></div><div><strong>{module.metrics.averageResolutionMinutes} min</strong><span>Resolução média</span></div></div></article>
      <article className="panel"><header><div><span className="eyebrow">CARGA ATUAL</span><h3>Conversas por setor</h3></div></header><div className="department-bars">{byDepartment.map((department) => <div key={department.id}><span>{department.name}</span><i><b style={{ width: `${(department.count / max) * 100}%` }} /></i><strong>{department.count}</strong></div>)}</div></article>
    </div>
  </div>;
}

function ChatSettings({ module, section, onSection, busy, has, operate }: {
  module: ChatModuleData; section: SettingsSection; onSection: (value: SettingsSection) => void;
  busy: boolean; has: (capability: string) => boolean; operate: Props["operate"];
}) {
  const sections: Array<[SettingsSection, string, React.ComponentType<{ size?: number }>]> = [
    ["queues", "Filas", Users], ["channels", "Canais", Wifi], ["whatsapp", "WhatsApp", Phone],
    ["tags", "Etiquetas", Tag], ["replies", "Respostas rápidas", MessageSquareText],
  ];
  return <div className="chat-settings-layout">
    <aside><span className="eyebrow">CADASTROS DO CHAT</span><h2>Configurações</h2><p>Cada cadastro possui sua própria tela.</p>
      <nav>{sections.map(([key, label, Icon]) => <button key={key} className={section === key ? "active" : ""} onClick={() => onSection(key)}><Icon size={17} /><span>{label}</span><ChevronRight size={15} /></button>)}</nav>
    </aside>
    <main>
      {section === "queues" && <QueueSettings module={module} busy={busy} allowed={has("manageCatalogs")} operate={operate} />}
      {section === "channels" && <ChannelSettings module={module} busy={busy} allowed={has("manageChannels")} operate={operate} />}
      {section === "whatsapp" && <WhatsAppSettings module={module} busy={busy} allowed={has("manageWhatsApp")} operate={operate} />}
      {section === "tags" && <TagSettings module={module} busy={busy} allowed={has("manageCatalogs")} operate={operate} />}
      {section === "replies" && <ReplySettings module={module} busy={busy} allowed={has("manageCatalogs")} operate={operate} />}
    </main>
  </div>;
}

function SettingsHeader({ title, description }: { title: string; description: string }) {
  return <header className="settings-page-head"><div><span className="eyebrow">CONFIGURAÇÃO</span><h2>{title}</h2><p>{description}</p></div></header>;
}
function ActiveInput() { return <label className="chat-checkbox"><input name="active" type="checkbox" defaultChecked /> Cadastro ativo</label>; }
function DepartmentSelect({ module, name = "departmentId" }: { module: ChatModuleData; name?: string }) {
  return <select name={name} required><option value="">Selecione o setor</option>{module.departments.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>;
}

function QueueSettings({ module, busy, allowed, operate }: { module: ChatModuleData; busy: boolean; allowed: boolean; operate: Props["operate"] }) {
  return <><SettingsHeader title="Filas de atendimento" description="Organize a distribuição de conversas dentro de cada setor." />
    {allowed && <form className="chat-settings-form" onSubmit={submitSettings(operate, "saveChatQueue", "Fila salva.")}><input name="name" required placeholder="Nome da fila" /><DepartmentSelect module={module} /><select name="distributionStrategy"><option>Manual</option><option>Round robin</option><option>Menor carga</option></select><input name="catalogDescription" placeholder="Descrição da fila" /><ActiveInput /><button disabled={busy}><Plus size={16} /> Adicionar fila</button></form>}
    <SettingsList items={module.queues.map((item) => ({ id: item.id, title: item.name, subtitle: `${item.departmentName} · ${item.distributionStrategy}`, active: item.active }))} />
  </>;
}
function ChannelSettings({ module, busy, allowed, operate }: { module: ChatModuleData; busy: boolean; allowed: boolean; operate: Props["operate"] }) {
  return <><SettingsHeader title="Canais" description="Cada canal pertence exclusivamente a um setor e pode definir fila e responsável padrão." />
    {allowed && <form className="chat-settings-form wide" onSubmit={submitSettings(operate, "saveChatChannel", "Canal salvo.")}><input name="name" required placeholder="Nome do canal" /><select name="channelType"><option>Interno</option><option>WhatsApp</option><option>E-mail</option><option>Instagram</option><option>Webchat</option></select><DepartmentSelect module={module} /><select name="queueId"><option value="">Fila padrão</option>{module.queues.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.departmentName} · {item.name}</option>)}</select><input name="greetingMessage" placeholder="Mensagem de saudação" /><input name="awayMessage" placeholder="Mensagem fora do horário" /><label className="chat-checkbox"><input name="allowTransfer" type="checkbox" defaultChecked /> Permitir transferência</label><label className="chat-checkbox"><input name="aiEnabled" type="checkbox" /> Recursos de IA</label><label className="chat-checkbox"><input name="autoCreateTask" type="checkbox" /> Criar tarefa automaticamente</label><ActiveInput /><button disabled={busy}><Plus size={16} /> Adicionar canal</button></form>}
    <SettingsList items={module.channels.map((item) => ({ id: item.id, title: item.name, subtitle: `${item.type} · ${item.departmentName}`, active: item.active }))} />
  </>;
}
function WhatsAppSettings({ module, busy, allowed, operate }: { module: ChatModuleData; busy: boolean; allowed: boolean; operate: Props["operate"] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<"CloudApi" | "Coexistence">("Coexistence");
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState("");
  const editing = module.whatsAppNumbers.find((item) => item.id === editingId) ?? null;

  const startCoexistence = async (item: ChatModuleData["whatsAppNumbers"][number]) => {
    setOnboardingError("");
    if (!item.metaAppId || !item.embeddedSignupConfigId || !item.hasAppSecret || !item.hasVerifyToken) {
      setOnboardingError("Edite o cadastro e informe App ID, Configuration ID, App Secret e Verify Token antes de conectar.");
      return;
    }
    setConnectingId(item.id);
    try {
      const facebook = await loadFacebookSdk(item.metaAppId, item.apiVersion);
      let authorizationCode = "";
      let wabaId = "";
      let submitted = false;
      let timeoutId = 0;

      const cleanup = () => {
        window.removeEventListener("message", sessionInfoListener);
        if (timeoutId) window.clearTimeout(timeoutId);
        setConnectingId(null);
      };
      const complete = async () => {
        if (submitted || !authorizationCode || !wabaId) return;
        submitted = true;
        const result = await operate({
          action: "completeChatWhatsAppCoexistence",
          id: item.id,
          authorizationCode,
          wabaId,
        }, "Coexistência ativada e sincronização iniciada.");
        cleanup();
        if (!result) setOnboardingError("A Meta concluiu o login, mas a configuração final falhou. Confira o erro exibido e tente novamente.");
      };
      const sessionInfoListener = (event: MessageEvent) => {
        if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
        let data: unknown = event.data;
        if (typeof data === "string") {
          try { data = JSON.parse(data); } catch { return; }
        }
        if (!data || typeof data !== "object" || !("type" in data) || data.type !== "WA_EMBEDDED_SIGNUP") return;
        const session = data as { event?: string; data?: { waba_id?: string }; error_message?: string };
        if (session.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          wabaId = session.data?.waba_id ?? "";
          void complete();
        } else if (session.event === "CANCEL" || session.event === "ERROR") {
          setOnboardingError(session.error_message || "O onboarding de coexistência foi cancelado na Meta.");
          cleanup();
        }
      };

      window.addEventListener("message", sessionInfoListener);
      timeoutId = window.setTimeout(() => {
        setOnboardingError("O onboarding expirou antes de a Meta concluir. Abra novamente o fluxo de conexão.");
        cleanup();
      }, 180000);

      facebook.login((response) => {
        authorizationCode = response.authResponse?.code ?? "";
        if (!authorizationCode) {
          setOnboardingError("A Meta não retornou o código de autorização. Verifique se o app está publicado e se o domínio está autorizado.");
          cleanup();
          return;
        }
        void complete();
      }, {
        config_id: item.embeddedSignupConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      });
    } catch (caught) {
      setConnectingId(null);
      setOnboardingError(caught instanceof Error ? caught.message : "Não foi possível iniciar o onboarding da Meta.");
    }
  };

  return <><SettingsHeader title="Números oficiais do WhatsApp" description="Conecte o WhatsApp Business App à Cloud API sem retirar o número do celular." />
    <div className="settings-rule-note coexistence-note"><ShieldCheck size={18} /><span><b>Coexistência oficial da Meta</b>O fluxo usa Embedded Signup. O número continua no WhatsApp Business App e as mensagens enviadas pelo celular entram na central como espelhos.</span></div>
    {onboardingError && <div className="coexistence-error"><b>Não foi possível concluir</b><span>{onboardingError}</span></div>}
    {allowed && <form key={editingId ?? "new"} className="chat-settings-form wide whatsapp-form" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await operate({
        action: "saveChatWhatsAppNumber",
        id: editingId,
        internalName: form.get("internalName"),
        displayName: form.get("displayName"),
        phone: form.get("phone"),
        departmentId: form.get("departmentId"),
        channelId: form.get("channelId"),
        phoneNumberId: form.get("phoneNumberId"),
        wabaId: form.get("wabaId"),
        businessManagerId: form.get("businessManagerId"),
        connectionMode: form.get("connectionMode"),
        metaAppId: form.get("metaAppId"),
        embeddedSignupConfigId: form.get("embeddedSignupConfigId"),
        apiVersion: form.get("apiVersion"),
        accessToken: form.get("accessToken"),
        verifyToken: form.get("verifyToken"),
        appSecret: form.get("appSecret"),
        active: form.has("active"),
      }, editing ? "Número WhatsApp atualizado." : "Número WhatsApp salvo.");
      if (result) { setEditingId(null); setConnectionMode("Coexistence"); event.currentTarget.reset(); }
    }}>
      <label className="whatsapp-field"><span>Modelo de conexão</span><select name="connectionMode" value={connectionMode} onChange={(event) => setConnectionMode(event.target.value as "CloudApi" | "Coexistence")}><option value="Coexistence">Coexistência · App + API</option><option value="CloudApi">Somente Cloud API</option></select></label>
      <input name="internalName" required placeholder="Nome interno (ex.: Suporte 01)" defaultValue={editing?.internalName} />
      <input name="displayName" required placeholder="Nome exibido no WhatsApp" defaultValue={editing?.displayName} />
      <input name="phone" required placeholder="Número com DDI e DDD" defaultValue={editing?.phoneNumber} />
      <select name="departmentId" required defaultValue={editing?.departmentId ?? ""}><option value="">Selecione o setor</option>{module.departments.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select name="channelId" required defaultValue={editing?.channelId ?? ""}><option value="">Canal WhatsApp</option>{module.channels.filter((item) => item.active && item.type === "WhatsApp").map((item) => <option value={item.id} key={item.id}>{item.departmentName} · {item.name}</option>)}</select>
      {connectionMode === "CloudApi" && <input name="phoneNumberId" placeholder="Phone Number ID (Meta)" defaultValue={editing?.phoneNumberId} />}
      {connectionMode === "CloudApi" && <input name="wabaId" placeholder="WhatsApp Business Account ID" defaultValue={editing?.wabaId} />}
      {connectionMode === "Coexistence" && <input name="metaAppId" required placeholder="App ID da Meta" defaultValue={editing?.metaAppId} />}
      {connectionMode === "Coexistence" && <input name="embeddedSignupConfigId" required placeholder="Configuration ID do Embedded Signup" defaultValue={editing?.embeddedSignupConfigId} />}
      <input name="businessManagerId" placeholder="Business Manager ID" defaultValue={editing?.businessManagerId} />
      <input name="apiVersion" defaultValue={editing?.apiVersion ?? "v23.0"} placeholder="Versão da Graph API" />
      {connectionMode === "CloudApi" && <input name="accessToken" type="password" autoComplete="new-password" placeholder={editing?.hasAccessToken ? "Novo token (vazio mantém o atual)" : "Token permanente da Meta"} />}
      <input name="verifyToken" type="password" autoComplete="new-password" placeholder={editing ? "Novo Verify Token (vazio mantém o atual)" : "Token de verificação do webhook"} />
      <input name="appSecret" type="password" autoComplete="new-password" placeholder={editing ? "Novo App Secret (vazio mantém o atual)" : "App Secret"} />
      <label className="chat-checkbox"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} /> Cadastro ativo</label>
      {connectionMode === "Coexistence" && <p className="coexistence-form-help">Após salvar, use <b>Conectar com Facebook</b> no cartão do número. O token será obtido pelo backend e nunca será exibido no navegador.</p>}
      <div className="whatsapp-form-actions">
        {editing && <button type="button" className="cancel-edit" onClick={() => { setEditingId(null); setConnectionMode("Coexistence"); }}><X size={15} /> Cancelar</button>}
        <button disabled={busy}>{editing ? <Save size={16} /> : <Plus size={16} />} {editing ? "Salvar alterações" : "Adicionar número"}</button>
      </div>
    </form>}
    <div className="whatsapp-number-grid">{module.whatsAppNumbers.map((item) => <article className={editingId === item.id ? "editing" : ""} key={item.id}>
      <span className="whatsapp-icon"><Phone size={19} /></span>
      <div><h3>{item.internalName}</h3><p>{item.displayName} · {item.phoneNumber}</p><small>{item.departmentName} · {item.connectionMode === "Coexistence" ? "Coexistência" : "Cloud API"} · API {item.apiVersion}</small></div>
      <em className={item.active && item.status === "Configurado" ? "active" : item.coexistenceStatus === "Erro" ? "error" : ""}>{item.connectionMode === "Coexistence" ? item.coexistenceStatus : item.status}</em>
      <span className="credential-state">{item.hasAccessToken ? <><Check size={13} /> Credencial protegida</> : item.connectionMode === "Coexistence" ? "Aguardando Embedded Signup" : "Sem token"}</span>
      {item.coexistenceError && <p className="coexistence-card-error">{item.coexistenceError}</p>}
      {allowed && <div className="whatsapp-card-actions">
        {item.connectionMode === "Coexistence" && item.coexistenceStatus !== "Ativo" && <button className="connect-meta" disabled={busy || connectingId === item.id} onClick={() => void startCoexistence(item)}><Wifi size={14} /> {connectingId === item.id ? "Abrindo Meta..." : item.hasAccessToken ? "Conectar novamente com Facebook" : "Conectar com Facebook"}</button>}
        {item.connectionMode === "Coexistence" && item.coexistenceStatus === "Erro" && item.hasAccessToken && <button className="retry-coexistence" disabled={busy} onClick={() => void operate({ action: "retryChatWhatsAppCoexistence", id: item.id }, "Sincronização da coexistência concluída.")}><RefreshCw size={14} /> Tentar novamente</button>}
        <button className="edit-whatsapp-number" onClick={() => { setEditingId(item.id); setConnectionMode(item.connectionMode); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil size={14} /> Editar</button>
      </div>}
    </article>)}</div>
  </>;
}
function TagSettings({ module, busy, allowed, operate }: { module: ChatModuleData; busy: boolean; allowed: boolean; operate: Props["operate"] }) {
  return <><SettingsHeader title="Etiquetas" description="Classifique conversas por tema, urgência ou contexto comercial." />{allowed && <form className="chat-settings-form" onSubmit={submitSettings(operate, "saveChatTag", "Etiqueta salva.")}><input name="name" required placeholder="Nome da etiqueta" /><input name="color" type="color" defaultValue="#2563eb" /><select name="departmentId"><option value="">Todos os setores</option>{module.departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ActiveInput /><button disabled={busy}><Plus size={16} /> Adicionar etiqueta</button></form>}<SettingsList items={module.tags.map((item) => ({ id: item.id, title: item.name, subtitle: item.departmentId ? module.departments.find((department) => department.id === item.departmentId)?.name ?? "Setor" : "Todos os setores", active: item.active, color: item.color }))} /></>;
}
function ReplySettings({ module, busy, allowed, operate }: { module: ChatModuleData; busy: boolean; allowed: boolean; operate: Props["operate"] }) {
  return <><SettingsHeader title="Respostas rápidas" description="Padronize mensagens frequentes e acelere o atendimento." />{allowed && <form className="chat-settings-form wide" onSubmit={submitSettings(operate, "saveChatQuickReply", "Resposta rápida salva.")}><input name="shortcut" required placeholder="/atalho" /><input name="title" required placeholder="Título" /><select name="departmentId"><option value="">Todos os setores</option>{module.departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><textarea name="body" required rows={3} placeholder="Texto da resposta rápida" /><ActiveInput /><button disabled={busy}><Plus size={16} /> Adicionar resposta</button></form>}<SettingsList items={module.quickReplies.map((item) => ({ id: item.id, title: `${item.shortcut} · ${item.title}`, subtitle: item.body, active: item.active }))} /></>;
}
function submitSettings(operate: Props["operate"], action: string, success: string) {
  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = { action };
    form.forEach((value, key) => { payload[key] = value; });
    payload.active = form.has("active"); payload.allowTransfer = form.has("allowTransfer");
    payload.aiEnabled = form.has("aiEnabled"); payload.autoCreateTask = form.has("autoCreateTask");
    if (await operate(payload, success)) event.currentTarget.reset();
  };
}
function SettingsList({ items }: { items: Array<{ id: string; title: string; subtitle: string; active: boolean; color?: string }> }) {
  return <div className="chat-settings-list">{items.map((item) => <article key={item.id}><i style={{ background: item.color }} /><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><em className={item.active ? "active" : ""}>{item.active ? "Ativo" : "Inativo"}</em></article>)}</div>;
}

function NewConversationModal({ module, busy, onClose, onSubmit }: { module: ChatModuleData; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const [channelId, setChannelId] = useState(module.channels.find((item) => item.active)?.id ?? "");
  const channel = module.channels.find((item) => item.id === channelId);
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><div className="modal chat-new-modal"><div className="modal-head"><div><span className="eyebrow">NOVO ATENDIMENTO</span><h2>Iniciar conversa</h2><p>O protocolo será gerado automaticamente.</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div><form className="form-grid" onSubmit={(event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    onSubmit({ contactName: form.get("contactName"), phone: form.get("phone"), email: form.get("email"), companyName: form.get("companyName"), customerId: form.get("customerId") || null, channelId, queueId: form.get("queueId") || null, assigneeUserId: form.get("assigneeUserId") || null, subject: form.get("subject"), priority: form.get("priority"), initialMessage: form.get("initialMessage") });
  }}>
    <label>Nome do contato<input name="contactName" required /></label><label>Telefone<input name="phone" placeholder="55 11 99999-9999" /></label><label>E-mail<input name="email" type="email" /></label><label>Empresa<input name="companyName" /></label><label className="wide">Assunto<input name="subject" required /></label><label>Canal<select required value={channelId} onChange={(event) => setChannelId(event.target.value)}><option value="">Selecione</option>{module.channels.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.departmentName} · {item.name}</option>)}</select></label><label>Fila<select name="queueId" required><option value="">Selecione</option>{module.queues.filter((item) => item.active && item.departmentId === channel?.departmentId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Responsável<select name="assigneeUserId"><option value="">Fila compartilhada</option>{module.users.filter((item) => item.departmentIds.includes(channel?.departmentId ?? "")).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Prioridade<select name="priority"><option>Normal</option><option>Baixa</option><option>Alta</option><option>Urgente</option></select></label><label className="wide">Mensagem inicial<textarea name="initialMessage" rows={4} placeholder="Contexto recebido do cliente" /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><CirclePlus size={16} /> Criar atendimento</button></div>
  </form></div></div>;
}
