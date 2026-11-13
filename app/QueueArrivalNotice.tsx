"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BellRing, UsersRound, X } from "lucide-react";
import { QUEUE_ARRIVAL_DURATION, QUEUE_ARRIVAL_EVENT, type QueueArrival } from "@/lib/queue-arrival";
import "./queue-arrival.css";

export default function QueueArrivalNotice() {
  const [queue, setQueue] = useState<QueueArrival[]>([]);
  const seen = useRef(new Set<string>());
  const active = queue[0];
  const activeId = active?.id;
  useEffect(() => {
    const receive = (event: Event) => {
      const rows = (event as CustomEvent<QueueArrival[]>).detail;
      if (!Array.isArray(rows)) return;
      const added = rows.filter(entry => { if (!entry?.id || typeof entry.customerName !== 'string' || seen.current.has(entry.id)) return false; seen.current.add(entry.id); return true; });
      while (seen.current.size > 2000) seen.current.delete(seen.current.values().next().value!);
      if (added.length) setQueue(current => [...current, ...added]);
    };
    window.addEventListener(QUEUE_ARRIVAL_EVENT, receive);
    return () => window.removeEventListener(QUEUE_ARRIVAL_EVENT, receive);
  }, []);
  useEffect(() => {
    if (!activeId) return;
    const timer = setTimeout(() => setQueue(current => current.slice(1)), QUEUE_ARRIVAL_DURATION);
    return () => clearTimeout(timer);
  }, [activeId]);
  if (!active) return null;
  return createPortal(<div className="queue-arrival-overlay" role="status" aria-live="polite"><section className="queue-arrival-card" key={active.id}>
    <button className="queue-arrival-close" type="button" aria-label="Fechar aviso da fila" onClick={() => setQueue(current => current.slice(1))}><X size={18}/></button>
    <div className="queue-arrival-icon"><BellRing size={35}/></div><span className="queue-arrival-eyebrow">FILA DE ESPERA</span><h2>Novo cliente aguardando</h2><strong>{active.customerName}</strong>{active.clientId && <span className="queue-arrival-client-id">ID {active.clientId}</span>}
    <p><UsersRound size={16}/>{active.department}</p><footer>O aviso fecha automaticamente em 30 segundos.{queue.length > 1 && <span>Mais {queue.length - 1} cliente(s) na fila de avisos.</span>}<i/></footer>
  </section></div>, document.body);
}
