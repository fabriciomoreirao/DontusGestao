"use client";

import { useRef, useState } from "react";
import { MessageCircleMore, Paperclip, Send, ShieldCheck } from "lucide-react";
import type { ChatModuleData } from "@/app/ChatModule";
import { sendChatDraft, type ChatDraftStore } from "@/lib/chat-drafts";
import useChatDraftInput from "@/app/useChatDraftInput";

export default function ChatMessageComposer({
  drafts,
  conversationId,
  departmentId,
  quickReplies,
  busy,
  canSendMessages,
  canInternalNotes,
  onSend,
  onUpload,
}: {
  drafts: ChatDraftStore;
  conversationId: string;
  departmentId: string;
  quickReplies: ChatModuleData["quickReplies"];
  busy: boolean;
  canSendMessages: boolean;
  canInternalNotes: boolean;
  onSend: (body: string, internal: boolean) => Promise<unknown>;
  onUpload: (files: File[], internal: boolean) => Promise<unknown>;
}) {
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const key = `${conversationId}:${internal ? "note" : "reply"}`;
  const { hasMessage, input } = useChatDraftInput(drafts, key, inputRef);
  const allowed = internal ? canInternalNotes : canSendMessages;
  async function send() {
    if (busy || !allowed || sendingRef.current || !drafts.get(key).trim())
      return;
    sendingRef.current = true;
    setSending(true);
    setErrors((current) => ({ ...current, [key]: "" }));
    try {
      const sent = await sendChatDraft(drafts, key, (body) =>
        onSend(body, internal),
      );
      if (!sent)
        setErrors((current) => ({
          ...current,
          [key]:
            "Não foi possível enviar. O texto foi mantido para tentar novamente.",
        }));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  return (
    <footer className={`chat-composer ${internal ? "internal" : ""}`}>
      <div className="composer-mode">
        <button
          className={!internal ? "active" : ""}
          onClick={() => setInternal(false)}
          disabled={!canSendMessages}
        >
          <MessageCircleMore size={15} /> Responder
        </button>
        <button
          className={internal ? "active" : ""}
          onClick={() => setInternal(true)}
          disabled={!canInternalNotes}
        >
          <ShieldCheck size={15} /> Nota interna
        </button>
        <select
          aria-label="Resposta rápida"
          value=""
          onChange={(event) => {
            const reply = quickReplies.find(
              (item) => item.id === event.target.value,
            );
            if (reply) drafts.set(key, reply.body);
          }}
        >
          <option value="">Respostas rápidas</option>
          {quickReplies
            .filter(
              (item) =>
                item.active &&
                (!item.departmentId || item.departmentId === departmentId),
            )
            .map((reply) => (
              <option value={reply.id} key={reply.id}>
                {reply.shortcut} · {reply.title}
              </option>
            ))}
        </select>
      </div>
      {errors[key] && <p role="alert">{errors[key]}</p>}
      <textarea
        ref={inputRef}
        rows={4}
        defaultValue={drafts.get(key)}
        onChange={(event) => input(event.target.value)}
        disabled={!allowed}
        aria-label={
          internal ? "Nota interna do atendimento" : "Mensagem para o cliente"
        }
        placeholder={
          internal
            ? "Escreva uma nota visível apenas para a equipe…"
            : "Digite sua mensagem para o cliente…"
        }
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.ctrlKey || event.metaKey) &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="composer-actions">
        <span>Ctrl + Enter para enviar</span>
        <div>
          <label className="composer-attachment">
            <Paperclip size={16} />
            <span>Anexar</span>
            <input
              type="file"
              multiple
              disabled={busy || !allowed}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) void onUpload(files, internal);
                event.target.value = "";
              }}
            />
          </label>
          <button
            disabled={busy || sending || !allowed || !hasMessage}
            onClick={() => void send()}
          >
            <Send size={16} /> {internal ? "Salvar nota" : "Enviar mensagem"}
          </button>
        </div>
      </div>
    </footer>
  );
}
