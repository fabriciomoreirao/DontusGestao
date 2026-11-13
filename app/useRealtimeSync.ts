"use client";

import { useEffect, useRef, useState } from "react";
import { createRealtimeSync } from "@/lib/realtime-sync";
import { chatTypingStore, type ChatTyping } from "@/lib/chat-typing";
import type {ChatPresence} from "@/lib/chat-presence";

export default function useRealtimeSync(options: {
  user: string | undefined; canChat: boolean; busy: boolean; cursor: () => string;
  operations: () => Promise<boolean>; chat: () => Promise<boolean>; unauthorized: (message?: string) => void;
  presence?: (users:ChatPresence[]) => void;
  typing?: (changes:ChatTyping[]) => void;
}) {
  const latest = useRef(options);
  const [connected, setConnected] = useState(false);
  useEffect(() => { latest.current = options; });
  useEffect(() => {
    chatTypingStore.clear();
    if (!options.user) return;
    const url = new URL("/api/realtime", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const sync = createRealtimeSync({
      url: url.href, canChat: options.canChat, busy: () => latest.current.busy, hidden: () => document.hidden,
      cursor: () => latest.current.cursor(), operations: () => latest.current.operations(), chat: () => latest.current.chat(),
      status: setConnected, unauthorized: message => latest.current.unauthorized(message),
      presence: users=>latest.current.presence?.(users),
      typing: changes=>latest.current.typing?.(changes),
    });
    document.addEventListener("visibilitychange", sync.visible);
    window.addEventListener("online", sync.online);
    return () => { sync.stop(); setConnected(false); document.removeEventListener("visibilitychange", sync.visible); window.removeEventListener("online", sync.online); };
  }, [options.user, options.canChat]);
  return connected;
}
