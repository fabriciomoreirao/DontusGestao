"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircleMore, X } from "lucide-react";
import { waApi } from "@/lib/whatsapp-admin";
import { playNotificationSound } from "@/lib/notification-sound";
type Message = { id: string; conversationId: string; clientName: string; responsible: string; body: string; type: string; mediaName: string };
export default function WhatsAppIncomingNotifications({ email, onOpen }: { email: string; onOpen: (conversationId: string) => void }) {
  const [alerts, setAlerts] = useState<Message[]>([]); const callback = useRef(onOpen); useEffect(() => { callback.current = onOpen; }, [onOpen]);
  useEffect(() => {
    let active = true; let cursor: string | undefined; let running = false; const heard = new Set<string>(); const controller = new AbortController(); const timers = new Set<ReturnType<typeof setTimeout>>();
    async function refresh() { if (running || document.visibilityState === "hidden" || !active) return; running = true; try { const result = await waApi<{ cursor: string; messages: Message[] }>(`notifications${cursor ? `?since=${encodeURIComponent(cursor)}` : ""}`, undefined, controller.signal); if (!active) return; cursor = result.cursor; const incoming = result.messages.filter(m => !heard.has(m.id)); incoming.forEach(m => heard.add(m.id)); if (incoming.length) { setAlerts(current => [...incoming.reverse(), ...current].slice(0, 4)); playNotificationSound(); for (const message of incoming) { const timer = setTimeout(() => { setAlerts(current => current.filter(m => m.id !== message.id)); timers.delete(timer); }, 12000); timers.add(timer); } } } catch { /* Recupera no próximo aviso ou consulta de contingência. */ } finally { running = false; } }
    void refresh(); const update = () => { void refresh(); }; window.addEventListener("dontus:whatsapp-refresh", update); document.addEventListener("visibilitychange", update); const timer = setInterval(update, 15000);
    return () => { active = false; controller.abort(); clearInterval(timer); timers.forEach(clearTimeout); window.removeEventListener("dontus:whatsapp-refresh", update); document.removeEventListener("visibilitychange", update); };
  }, [email]);
  return <aside className="wa-notification-stack" aria-label="Novas mensagens do WhatsApp" aria-live="polite">{alerts.map(a => <article key={a.id}><button className="wa-notification-open" onClick={() => { setAlerts(current => current.filter(m => m.id !== a.id)); callback.current(a.conversationId); }}><MessageCircleMore size={25}/><span><small>WHATSAPP · {a.responsible}</small><strong>{a.clientName}</strong><span>{a.body || a.mediaName || "Nova mensagem recebida"}</span></span></button><button className="wa-notification-close" aria-label="Fechar aviso do WhatsApp" onClick={() => setAlerts(current => current.filter(m => m.id !== a.id))}><X size={16}/></button></article>)}</aside>;
}
