"use client";

import type { ClipboardEventHandler, RefObject } from "react";
import { Send } from "lucide-react";
import type { ChatDraftStore } from "@/lib/chat-drafts";
import useChatDraftInput from "@/app/useChatDraftInput";

export default function InternalChatDraftComposer({
  drafts,
  conversationKey,
  inputRef,
  busy,
  canCreate,
  recording,
  hasAttachments,
  onPaste,
  onTyping,
}: {
  drafts: ChatDraftStore;
  conversationKey: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  busy: boolean;
  canCreate: boolean;
  recording: boolean;
  hasAttachments: boolean;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onTyping?: (active: boolean) => void;
}) {
  const { hasMessage, input } = useChatDraftInput(
    drafts,
    conversationKey,
    inputRef,
    onTyping,
  );
  return (
    <>
      <textarea
        ref={inputRef}
        rows={1}
        disabled={!canCreate || recording}
        aria-label="Mensagem do chat interno"
        defaultValue={drafts.get(conversationKey)}
        onChange={(event) => input(event.target.value)}
        onBlur={() => onTyping?.(false)}
        onPaste={onPaste}
        placeholder="Escreva uma mensagem..."
        maxLength={4000}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <button
        className="internal-chat-send"
        onPointerDown={(event) => {
          if (event.button === 0) event.preventDefault();
        }}
        disabled={busy || !canCreate || (!hasMessage && !hasAttachments)}
        aria-label="Enviar mensagem"
      >
        <Send size={18} />
      </button>
    </>
  );
}
