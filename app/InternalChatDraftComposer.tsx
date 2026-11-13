"use client";

import { useLayoutEffect, useSyncExternalStore, type ClipboardEventHandler, type RefObject } from "react";
import { Send } from "lucide-react";
import type { ChatDraftStore } from "@/lib/chat-drafts";

export default function InternalChatDraftComposer({ drafts, conversationKey, inputRef, busy, canCreate, recording, hasAttachments, onPaste, onTyping }: {
  drafts: ChatDraftStore; conversationKey: string; inputRef: RefObject<HTMLTextAreaElement | null>;
  busy: boolean; canCreate: boolean; recording: boolean; hasAttachments: boolean;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>; onTyping?: (active: boolean) => void;
}) {
  const hasMessage = useSyncExternalStore(drafts.subscribe, () => Boolean(drafts.get(conversationKey).trim()), () => false);
  useLayoutEffect(() => {
    const sync = () => {
      const input = inputRef.current;
      const value = drafts.get(conversationKey);
      // Native input paints each character without waiting for a React commit.
      // Only external changes (emoji, restore, send or switching rooms) replace it.
      if (input && input.value !== value) { input.value = value; if (!value.trim()) onTyping?.(false); }
    };
    sync();
    return drafts.subscribe(sync);
  }, [drafts, conversationKey, inputRef, onTyping]);
  return <>
    <textarea ref={inputRef} rows={1} disabled={!canCreate || recording} aria-label="Mensagem do chat interno"
      defaultValue={drafts.get(conversationKey)} onChange={event => { drafts.set(conversationKey, event.target.value); onTyping?.(Boolean(event.target.value.trim())); }} onBlur={()=>onTyping?.(false)} onPaste={onPaste}
      placeholder="Escreva uma mensagem..." maxLength={4000}
      onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
    <button className="internal-chat-send" onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
      disabled={busy || !canCreate || (!hasMessage && !hasAttachments)} aria-label="Enviar mensagem"><Send size={18} /></button>
  </>;
}
