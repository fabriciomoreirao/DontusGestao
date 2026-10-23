"use client";

import { MessageCircleMore, X } from "lucide-react";

export type ChatAlert = { id:string; roomId:string; roomName:string; senderName:string; photo:string; body:string };

export default function ChatNotifications({alerts,onOpen,onDismiss}:{alerts:ChatAlert[];onOpen:(roomId:string)=>void;onDismiss:(id:string)=>void}){
  return <aside className="chat-notification-stack" aria-label="Novas mensagens do chat" aria-live="polite" aria-relevant="additions">
    {alerts.map(alert=><article className="chat-received-notification" key={alert.id}>
      <button className="chat-received-open" onClick={()=>onOpen(alert.roomId)} aria-label={`Abrir conversa ${alert.roomName}: ${alert.senderName}`}>
        <span className="chat-received-avatar">{alert.photo?<img src={alert.photo} alt=""/>:<MessageCircleMore size={22}/>}</span>
        <span className="chat-received-copy"><small>CHAT INTERNO · {alert.roomName}</small><strong>{alert.senderName}</strong><span>{alert.body}</span></span>
      </button>
      <button className="chat-received-close" aria-label="Fechar aviso de mensagem" onClick={()=>onDismiss(alert.id)}><X size={15}/></button>
    </article>)}
  </aside>;
}
