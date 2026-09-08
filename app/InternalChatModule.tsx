"use client";

import {
  Archive, ArchiveRestore, BadgeCheck, Camera, Download, FileText, LockKeyhole,
  MessageCircleMore, Paperclip, Plus, Search, Send, SmilePlus, UsersRound, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

export type InternalChatUser = {
  id: string; name: string; email: string; departmentName: string; photoDataUrl: string;
  jobTitle: string; isCoordinator: boolean;
};

export type InternalChatMessage = {
  id: string; roomId: string; senderUserId: string; senderName: string; senderPhotoDataUrl: string;
  senderIsCoordinator: boolean;
  type: "text" | "sticker" | "image" | "video" | "file"; body: string; fileName: string;
  contentType: string; hasAttachment: boolean; createdAt: string;
};

export type InternalChatRoom = {
  id: string; name: string; photoDataUrl: string; isGroup: boolean; createdByUserId: string;
  canManage: boolean; isArchived: boolean; unreadCount: number; lastMessageAt: string;
  memberUserIds: string[]; messages: InternalChatMessage[];
};

export type InternalChatModuleData = {
  currentUserId: string; users: InternalChatUser[]; rooms: InternalChatRoom[];
};

type OperationResult = { id?: string } | false;
type Props = {
  module: InternalChatModuleData;
  busy: boolean;
  canCreate: boolean;
  operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>;
  markRead: (roomId: string) => Promise<void>;
  uploadAttachments: (roomId: string, files: File[]) => Promise<boolean>;
  onOpenProfile: (userId: string) => void;
};
type Conversation = {
  key: string; name: string; photoDataUrl: string; isGroup: boolean;
  room?: InternalChatRoom; user?: InternalChatUser;
};

const stickers = ["😀", "😂", "😍", "🥳", "👏", "👍", "🙏", "🔥", "💙", "🎉", "✅", "🚀"];
const messageTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const roomTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

export default function InternalChatModule({ module, busy, canCreate, operate, markRead, uploadAttachments, onOpenProfile }: Props) {
  const [selectedKey, setSelectedKey] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [archivedView, setArchivedView] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const groupPhotoInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const conversations = useMemo(() => buildConversations(module, archivedView), [module, archivedView]);
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return query ? conversations.filter((entry) => `${entry.name} ${entry.user?.departmentName ?? ""}`.toLocaleLowerCase("pt-BR").includes(query)) : conversations;
  }, [conversations, search]);
  const effectiveSelectedKey = conversations.some((entry) => entry.key === selectedKey) ? selectedKey : conversations[0]?.key ?? "";
  const selectedConversation = conversations.find((entry) => entry.key === effectiveSelectedKey);
  const selectedRoom = selectedConversation?.room;
  const archivedCount = module.rooms.filter((room) => room.isArchived).length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedRoom?.id, selectedRoom?.messages.length]);

  useEffect(() => {
    if (selectedRoom?.unreadCount) void markRead(selectedRoom.id);
  }, [markRead, selectedRoom?.id, selectedRoom?.unreadCount]);

  const ensureRoom = async () => {
    if (selectedConversation?.room) return selectedConversation.room.id;
    if (!selectedConversation?.user) return "";
    const result = await operate({
      action: "createInternalChatRoom", name: "", photoDataUrl: "", isGroup: false,
      memberUserIds: [selectedConversation.user.id],
    }, "Conversa iniciada com sucesso.");
    if (!result || !result.id) return "";
    setSelectedKey(result.id);
    return result.id;
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const body = message.trim();
    if (!selectedConversation || !body) return;
    const roomId = await ensureRoom();
    if (!roomId) return;
    const result = await operate({ action: "sendInternalChatMessage", roomId, body, messageType: "text" }, "Mensagem enviada.");
    if (result) setMessage("");
  };

  const sendSticker = async (sticker: string) => {
    if (!selectedConversation) return;
    const roomId = await ensureRoom();
    if (!roomId) return;
    const result = await operate({ action: "sendInternalChatMessage", roomId, body: sticker, messageType: "sticker" }, "Figurinha enviada.");
    if (result) setStickersOpen(false);
  };

  const upload = async (files: FileList | null) => {
    if (!selectedConversation || !files?.length) return;
    const roomId = await ensureRoom();
    if (!roomId) return;
    const accepted = Array.from(files).filter((file) => file.size <= 50 * 1024 * 1024);
    if (accepted.length) await uploadAttachments(roomId, accepted);
    if (fileInput.current) fileInput.current.value = "";
  };

  const archive = async () => {
    if (!selectedRoom) return;
    const nextArchived = !selectedRoom.isArchived;
    const result = await operate({ action: "setInternalChatRoomArchived", roomId: selectedRoom.id, archived: nextArchived }, nextArchived ? "Conversa arquivada com sucesso." : "Conversa restaurada com sucesso.");
    if (result) setSelectedKey("");
  };

  const updateGroupPhoto = async (file?: File) => {
    if (!selectedRoom?.isGroup || !selectedRoom.canManage || !file) return;
    const photoDataUrl = await readImage(file);
    if (!photoDataUrl) return;
    await operate({ action: "updateInternalChatGroup", roomId: selectedRoom.id, name: selectedRoom.name, photoDataUrl }, "Foto do grupo atualizada com sucesso.");
    if (groupPhotoInput.current) groupPhotoInput.current.value = "";
  };

  return <div className="internal-chat-page">
    <header className="page-header internal-chat-page-header module-page-header">
      <div className="module-page-title"><span className="module-page-title-icon"><MessageCircleMore size={21} /></span><span className="module-page-copy"><span className="eyebrow">MÓDULO · COMUNICAÇÃO</span><h1>Chat interno</h1><p>Todos os colaboradores disponíveis, conversas privadas e grupos da sua equipe.</p></span></div>
      <div className="module-page-actions"><button className="primary-button" disabled={!canCreate} onClick={() => setCreatingGroup(true)}><Plus size={17} /> Novo grupo</button></div>
    </header>

    <section className="internal-chat-shell">
      <aside className="internal-chat-sidebar">
        <div className="internal-chat-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar colaboradores ou grupos..." /></div>
        <div className="internal-chat-view-tabs">
          <button className={!archivedView ? "active" : ""} onClick={() => { setArchivedView(false); setSelectedKey(""); }}>Conversas</button>
          <button className={archivedView ? "active" : ""} onClick={() => { setArchivedView(true); setSelectedKey(""); }}>Arquivadas {archivedCount > 0 && <b>{archivedCount}</b>}</button>
        </div>
        <div className="internal-chat-room-list">
          {filteredConversations.length === 0 && <div className="internal-chat-empty-list"><Archive size={24} /><span>{archivedView ? "Nenhuma conversa arquivada." : "Nenhum colaborador encontrado."}</span></div>}
          {filteredConversations.map((entry) => {
            const last = entry.room?.messages.at(-1);
            return <button className={`internal-chat-room ${effectiveSelectedKey === entry.key ? "active" : ""}`} onClick={() => setSelectedKey(entry.key)} key={entry.key}>
              <Avatar name={entry.name} photo={entry.photoDataUrl} group={entry.isGroup} coordinator={entry.user?.isCoordinator} />
              <span className="internal-chat-room-copy"><strong>{entry.name}</strong><small>{last ? messagePreview(last) : entry.isGroup ? "Grupo privado" : entry.user?.jobTitle || entry.user?.departmentName || "Inicie uma conversa"}</small></span>
              <span className="internal-chat-room-meta">{entry.room && <time>{roomTime.format(new Date(entry.room.lastMessageAt))}</time>}{!!entry.room?.unreadCount && <b>{entry.room.unreadCount}</b>}</span>
            </button>;
          })}
        </div>
        <div className="internal-chat-privacy"><LockKeyhole size={14} /><span>Conversas visíveis somente para os participantes.</span></div>
      </aside>

      <main className="internal-chat-conversation">
        {!selectedConversation ? <div className="internal-chat-welcome"><div><MessageCircleMore size={38} /></div><h2>Escolha um colaborador</h2><p>A conversa será criada automaticamente ao enviar a primeira mensagem.</p></div> : <>
          <header className="internal-chat-conversation-head">
            <span className="internal-chat-group-photo-wrap" role={selectedConversation.user?"button":undefined} tabIndex={selectedConversation.user?0:undefined} onClick={()=>selectedConversation.user&&onOpenProfile(selectedConversation.user.id)}><Avatar name={selectedConversation.name} photo={selectedConversation.photoDataUrl} group={selectedConversation.isGroup} coordinator={selectedConversation.user?.isCoordinator} />
              {selectedRoom?.isGroup && selectedRoom.canManage && <><input ref={groupPhotoInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void updateGroupPhoto(event.target.files?.[0])} /><button type="button" onClick={() => groupPhotoInput.current?.click()} aria-label="Alterar foto do grupo" title="Alterar foto do grupo"><Camera size={11} /></button></>}
            </span>
            <div className={selectedConversation.user?"internal-chat-profile-link":""} onClick={()=>selectedConversation.user&&onOpenProfile(selectedConversation.user.id)}><h2>{selectedConversation.name}</h2><p>{selectedConversation.isGroup ? `${selectedRoom?.memberUserIds.length ?? 0} participantes · Grupo privado` : `${selectedConversation.user?.jobTitle || "Conversa privada"} · ver perfil`}</p></div>
            <span className="internal-chat-secure"><LockKeyhole size={13} /> Privado</span>
            {selectedRoom && <button type="button" className="internal-chat-archive" onClick={() => void archive()} title={selectedRoom.isArchived ? "Restaurar conversa" : "Arquivar conversa"} aria-label={selectedRoom.isArchived ? "Restaurar conversa" : "Arquivar conversa"}>{selectedRoom.isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}</button>}
          </header>
          <div className="internal-chat-messages">
            {!selectedRoom?.messages.length && <div className="internal-chat-first-message"><SmilePlus size={23} /><strong>Diga olá!</strong><span>Envie a primeira mensagem para iniciar esta conversa privada.</span></div>}
            {selectedRoom?.messages.map((item) => <MessageBubble key={item.id} message={item} own={item.senderUserId === module.currentUserId} />)}
            <div ref={endRef} />
          </div>
          <form className="internal-chat-composer" onSubmit={sendMessage}>
            <input ref={fileInput} hidden type="file" multiple accept="image/*,video/*,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx" onChange={(event) => void upload(event.target.files)} />
            <button type="button" className="internal-chat-tool" onClick={() => fileInput.current?.click()} disabled={busy} aria-label="Anexar arquivo"><Paperclip size={19} /></button>
            <div className="internal-chat-sticker-wrap"><button type="button" className="internal-chat-tool" onClick={() => setStickersOpen((value) => !value)} disabled={busy} aria-label="Enviar figurinha"><SmilePlus size={19} /></button>{stickersOpen && <div className="internal-chat-stickers">{stickers.map((sticker) => <button type="button" key={sticker} onClick={() => void sendSticker(sticker)}>{sticker}</button>)}</div>}</div>
            <textarea rows={1} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escreva uma mensagem..." maxLength={4000} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <button className="internal-chat-send" disabled={busy || !message.trim()} aria-label="Enviar mensagem"><Send size={18} /></button>
          </form>
        </>}
      </main>
    </section>
    {creatingGroup && <CreateGroupModal module={module} busy={busy} onClose={() => setCreatingGroup(false)} onCreate={async (payload) => { const result = await operate({ action: "createInternalChatRoom", isGroup: true, ...payload }, "Grupo criado com sucesso."); if (result) { setCreatingGroup(false); if (result.id) setSelectedKey(result.id); } }} />}
  </div>;
}

function buildConversations(module: InternalChatModuleData, archived: boolean): Conversation[] {
  const others = module.users.filter((user) => user.id !== module.currentUserId);
  const directRooms = module.rooms.filter((room) => !room.isGroup);
  const groups: Conversation[] = module.rooms.filter((room) => room.isGroup && room.isArchived === archived).map((room) => ({ key: room.id, name: room.name, photoDataUrl: room.photoDataUrl, isGroup: true, room }));
  const directs: Conversation[] = others.flatMap((user) => {
    const room = directRooms.find((item) => item.memberUserIds.includes(user.id));
    if (archived && !room?.isArchived) return [];
    if (!archived && room?.isArchived) return [];
    return [{ key: room?.id ?? `user:${user.id}`, name: user.name, photoDataUrl: user.photoDataUrl, isGroup: false, room, user }];
  });
  return [...groups, ...directs].sort((a, b) => {
    if (a.room && b.room) return new Date(b.room.lastMessageAt).getTime() - new Date(a.room.lastMessageAt).getTime();
    if (a.room) return -1;
    if (b.room) return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function MessageBubble({ message, own }: { message: InternalChatMessage; own: boolean }) {
  const fileUrl = `/api/internal-chat-files/${message.id}`;
  return <article className={`internal-chat-message ${own ? "own" : ""}`}>
    {!own && <Avatar name={message.senderName} photo={message.senderPhotoDataUrl} coordinator={message.senderIsCoordinator} />}
    <div className="internal-chat-bubble-wrap">{!own && <strong>{message.senderName}</strong>}<div className={`internal-chat-bubble ${message.type === "sticker" ? "sticker" : ""}`}>
      {message.type === "text" && <p>{message.body}</p>}
      {message.type === "sticker" && <span className="internal-chat-sticker-message">{message.body}</span>}
      {message.type === "image" && <a href={fileUrl} target="_blank" rel="noreferrer"><img src={fileUrl} alt={message.fileName || "Imagem enviada"} loading="lazy" /></a>}
      {message.type === "video" && <video controls preload="metadata"><source src={fileUrl} type={message.contentType} />Seu navegador não suporta vídeo.</video>}
      {message.type === "file" && <a className="internal-chat-file" href={fileUrl} download={message.fileName}><FileText size={24} /><span><b>{message.fileName}</b><small>{message.contentType || "Arquivo"}</small></span><Download size={18} /></a>}
      <time>{messageTime.format(new Date(message.createdAt))}</time>
    </div></div>
  </article>;
}

function CreateGroupModal({ module, busy, onClose, onCreate }: { module: InternalChatModuleData; busy: boolean; onClose: () => void; onCreate: (payload: { name: string; photoDataUrl: string; memberUserIds: string[] }) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const available = module.users.filter((user) => user.id !== module.currentUserId);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); onCreate({ name: String(form.get("name") ?? ""), photoDataUrl, memberUserIds: selected }); };
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><div className="modal internal-chat-modal" role="dialog" aria-modal="true" aria-label="Novo grupo">
    <div className="modal-head"><div><span className="eyebrow">CHAT INTERNO</span><h2>Novo grupo privado</h2><p>Adicione uma foto e escolha os participantes do grupo.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
    <form onSubmit={submit}>
      <div className="internal-chat-group-identity"><button type="button" onClick={() => photoInput.current?.click()}><Avatar name="Novo grupo" photo={photoDataUrl} group /><span><Camera size={14} /> {photoDataUrl ? "Trocar foto" : "Adicionar foto"}</span></button><input ref={photoInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={async (event) => setPhotoDataUrl(await readImage(event.target.files?.[0]) ?? "")} /><label className="internal-chat-group-name">Nome do grupo *<input name="name" required minLength={2} maxLength={120} placeholder="Ex.: Equipe de suporte" /></label></div>
      <div className="internal-chat-member-title"><strong>Colaboradores</strong><span>{selected.length} selecionado(s)</span></div>
      <div className="internal-chat-member-list">{available.map((user) => <button type="button" className={selected.includes(user.id) ? "selected" : ""} onClick={() => toggle(user.id)} key={user.id}><Avatar name={user.name} photo={user.photoDataUrl} coordinator={user.isCoordinator} /><span><strong>{user.name}</strong><small>{user.jobTitle || user.departmentName || user.email}</small></span><i>{selected.includes(user.id) ? "✓" : "+"}</i></button>)}</div>
      {available.length === 0 && <div className="internal-chat-no-members">Cadastre outro colaborador ativo para criar um grupo.</div>}
      <div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || selected.length === 0} type="submit"><UsersRound size={16} /> {busy ? "Criando..." : "Criar grupo"}</button></div>
    </form>
  </div></div>;
}

function Avatar({ name, photo, group = false, coordinator = false }: { name: string; photo?: string; group?: boolean; coordinator?: boolean }) {
  return <span className={`internal-chat-avatar ${group ? "group" : ""}`} style={photo ? { backgroundImage: `url("${photo}")` } : undefined}>{!photo && (group ? <UsersRound size={18} /> : initials(name))}{coordinator && !group && <i className="coordinator-mark" title="Coordenador"><BadgeCheck size={12} /></i>}</span>;
}

async function readImage(file?: File) {
  if (!file || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 2 * 1024 * 1024) return null;
  return await new Promise<string | null>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = () => resolve(null); reader.readAsDataURL(file); });
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"; }
function messagePreview(message: InternalChatMessage) {
  if (message.type === "sticker") return `${message.body} Figurinha`;
  if (message.type === "image") return "Imagem";
  if (message.type === "video") return "Vídeo";
  if (message.type === "file") return message.fileName || "Arquivo";
  return message.body;
}
