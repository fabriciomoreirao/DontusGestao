"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircleMore, X } from "lucide-react";
import { waApi } from "@/lib/whatsapp-admin";
import { playNotificationSound } from "@/lib/notification-sound";
type Message = {
  id: string;
  conversationId: string;
  clientName: string;
  responsible: string;
  body: string;
  type: string;
  mediaName: string;
};
export default function WhatsAppIncomingNotifications({
  email,
  onOpen,
}: {
  email: string;
  onOpen: (conversationId: string) => void;
}) {
  const [alerts, setAlerts] = useState<Message[]>([]);
  const callback = useRef(onOpen);
  const dismiss = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    callback.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    let active = true;
    let cursor: string | undefined;
    let afterId = "";
    let running = false;
    const heard = new Set<string>();
    const controller = new AbortController();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const pending: Message[] = [];
    const visible = new Set<string>();
    function present() {
      while (active && visible.size < 4 && pending.length) {
        const message = pending.shift()!;
        visible.add(message.id);
        setAlerts((current) => [...current, message]);
        timers.set(
          message.id,
          setTimeout(() => close(message.id), 12000),
        );
      }
    }
    function close(id: string) {
      const timer = timers.get(id);
      if (timer) clearTimeout(timer);
      timers.delete(id);
      visible.delete(id);
      setAlerts((current) => current.filter((m) => m.id !== id));
      present();
    }
    dismiss.current = close;
    async function refresh() {
      if (running || document.visibilityState === "hidden" || !active) return;
      running = true;
      try {
        let more = true;
        let pages = 0;
        while (active && more && pages++ < 10) {
          const result = await waApi<{
            cursor: string;
            afterId: string;
            hasMore: boolean;
            messages: Message[];
          }>(
            `notifications${cursor ? `?since=${encodeURIComponent(cursor)}&afterId=${encodeURIComponent(afterId)}` : ""}`,
            undefined,
            controller.signal,
          );
          if (!active) return;
          cursor = result.cursor;
          afterId = result.afterId;
          more = result.hasMore;
          const incoming = result.messages.filter((m) => !heard.has(m.id));
          incoming.forEach((m) => heard.add(m.id));
          while (heard.size > 5000) heard.delete(heard.values().next().value!);
          if (incoming.length) {
            pending.push(...incoming);
            playNotificationSound();
            present();
          }
        }
      } catch {
        /* Recupera no próximo aviso ou consulta de contingência. */
      } finally {
        running = false;
      }
    }
    void refresh();
    const update = () => {
      void refresh();
    };
    window.addEventListener("dontus:whatsapp-refresh", update);
    document.addEventListener("visibilitychange", update);
    const timer = setInterval(update, 15000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      timers.forEach(clearTimeout);
      dismiss.current = () => {};
      window.removeEventListener("dontus:whatsapp-refresh", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [email]);
  return (
    <aside
      className="wa-notification-stack"
      aria-label="Novas mensagens do WhatsApp"
      aria-live="polite"
    >
      {alerts.map((a) => (
        <article key={a.id}>
          <button
            className="wa-notification-open"
            onClick={() => {
              dismiss.current(a.id);
              callback.current(a.conversationId);
            }}
          >
            <MessageCircleMore size={25} />
            <span>
              <small>WHATSAPP · {a.responsible}</small>
              <strong>{a.clientName}</strong>
              <span>{a.body || a.mediaName || "Nova mensagem recebida"}</span>
            </span>
          </button>
          <button
            className="wa-notification-close"
            aria-label="Fechar aviso do WhatsApp"
            onClick={() => dismiss.current(a.id)}
          >
            <X size={16} />
          </button>
        </article>
      ))}
    </aside>
  );
}
