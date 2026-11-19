"use client";

import { useLayoutEffect, useSyncExternalStore, type RefObject } from "react";
import type { ChatDraftStore } from "@/lib/chat-drafts";

export default function useChatDraftInput(
  drafts: ChatDraftStore,
  key: string,
  inputRef: RefObject<HTMLTextAreaElement | null>,
  onTyping?: (active: boolean) => void,
) {
  const hasMessage = useSyncExternalStore(
    drafts.subscribe,
    () => Boolean(drafts.get(key).trim()),
    () => false,
  );
  useLayoutEffect(() => {
    const sync = () => {
      const input = inputRef.current;
      const value = drafts.get(key);
      // Only external edits replace native text; ordinary keystrokes never
      // wait for a React commit or move the cursor back to the end.
      if (input && input.value !== value) {
        input.value = value;
        if (!value.trim()) onTyping?.(false);
      }
    };
    sync();
    return drafts.subscribe(sync);
  }, [drafts, key, inputRef, onTyping]);
  return {
    hasMessage,
    input: (value: string) => {
      drafts.input(key, value);
      onTyping?.(Boolean(value.trim()));
    },
  };
}
