"use client";
import {useEffect,useState} from "react";
import {CalendarClock} from "lucide-react";
import {agendaStatusAlerts,type AgendaStatusAlert,type AgendaStatusCommitment} from "@/lib/agenda-stale-alerts";
export default function AgendaStaleAlerts({alerts,commitments,currentUserId}:{alerts?:AgendaStatusAlert[];commitments?:AgendaStatusCommitment[];currentUserId?:string}){
 const [expanded,setExpanded]=useState(false);
 const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(timer)},[]);
 const visible=agendaStatusAlerts({alerts,commitments,currentUserId,now});
 if(!visible.length)return null;
 return <aside className="agenda-persistent-alerts" aria-label="Compromissos aguardando atualização" role="status"><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><CalendarClock size={18}/><strong>Atualize o status da agenda</strong><b>{visible.length}</b></button>{expanded&&<div>{visible.map(alert=><article key={alert.id}><span><b>{alert.title}</b><small>Compromisso de data anterior, pendente há pelo menos 3 dias.</small></span><a href={`/?mod=work&commitment=${encodeURIComponent(alert.id)}`}>Ver compromisso</a></article>)}</div>}</aside>;
}
