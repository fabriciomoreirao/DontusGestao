"use client";
import { useCallback, useEffect, useRef } from "react";
import { createChatTypingPublisher } from "@/lib/chat-typing";

export default function useChatTypingPublisher(roomId: string | undefined, enabled: boolean) {
  const publisher = useRef<ReturnType<typeof createChatTypingPublisher> | null>(null);
  useEffect(() => {
    if (!roomId || !enabled) return;
    const sessionId = crypto.randomUUID();
    const current = createChatTypingPublisher(async isTyping => {
      await fetch('/api/internal-chat/typing', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId, sessionId, isTyping }), keepalive: !isTyping, signal: AbortSignal.timeout(5_000) });
    });
    publisher.current = current;
    const hidden = () => { if (document.hidden) current.stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { current.dispose(); publisher.current = null; document.removeEventListener('visibilitychange', hidden); };
  }, [roomId, enabled]);
  return useCallback((active: boolean) => { if (active) publisher.current?.input(true); else publisher.current?.stop(); }, []);
}
