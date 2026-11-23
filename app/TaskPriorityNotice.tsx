"use client";
import { Flag } from "lucide-react";
import { useEffect, useRef } from "react";

type PriorityNotice = { id: string; taskId: string; eventType: string; message: string; read: boolean };
export default function TaskPriorityNotice({ notifications, busy, onOpen }: {
  notifications: PriorityNotice[]; busy: boolean; onOpen: (notice: PriorityNotice) => Promise<void>;
}) {
  const notice = notifications.find(entry => !entry.read && entry.eventType === "priority_requested");
  const noticeId = notice?.id;
  const button = useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(noticeId&&!busy)button.current?.focus();},[noticeId,busy]);
  if (!notice) return null;
  return <div className="task-priority-notice-overlay"><section className="task-priority-notice" role="alertdialog" aria-modal="true" aria-labelledby="task-priority-title" aria-describedby="task-priority-description" onKeyDown={event=>{if(event.key==="Tab"){event.preventDefault();event.currentTarget.querySelector("button")?.focus();}}}>
    <Flag size={32} aria-hidden="true"/><h2 id="task-priority-title">Tarefa com prioridade</h2>
    <p id="task-priority-description">{notice.message}</p>
    <button ref={button} type="button" disabled={busy} onClick={()=>void onOpen(notice)}>Ver tarefa</button>
  </section></div>;
}
