"use client";

import { useSyncExternalStore, type ClipboardEventHandler, type RefObject } from "react";
import { Send } from "lucide-react";
import type { ChatDraftStore } from "@/lib/chat-drafts";

export default function InternalChatDraftComposer({ drafts, conversationKey, inputRef, busy, canCreate, recording, hasAttachments, onPaste }: {
  drafts: ChatDraftStore; conversationKey: string; inputRef: RefObject<HTMLTextAreaElement | null>;
  busy: boolean; canCreate: boolean; recording: boolean; hasAttachments: boolean;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
}) {
  const message = useSyncExternalStore(drafts.subscribe, () => drafts.get(conversationKey), () => "");
  return <>
    <textarea ref={inputRef} rows={1} disabled={!canCreate || recording} aria-label="Mensagem do chat interno"
      value={message} onChange={event => drafts.set(conversationKey, event.target.value)} onPaste={onPaste}
      placeholder="Escreva uma mensagem..." maxLength={4000}
      onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
    <button className="internal-chat-send" onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
      disabled={busy || !canCreate || (!message.trim() && !hasAttachments)} aria-label="Enviar mensagem"><Send size={18} /></button>
  </>;
}
