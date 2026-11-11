"use client";
import {useEffect,useState} from "react";
import {CalendarClock} from "lucide-react";
type Alert={id:string;title:string;startsAt:string};
export default function AgendaStaleAlerts({alerts,commitments,currentUserId}:{alerts?:Alert[];commitments?:Array<Alert&{responsibleUserId:string;statusName:string;statusChangedAt?:string|null}>;currentUserId?:string}){
 const [expanded,setExpanded]=useState(false);
 const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(timer)},[]);
 const current=commitments?.filter(entry=>entry.responsibleUserId===currentUserId&&entry.statusName.replace(/[^a-z]/gi,"").toLowerCase()==="agendado"&&entry.statusChangedAt&&Date.parse(entry.statusChangedAt)<now-3*86_400_000);
 const visible=current?.length ? current : (alerts??[]).filter(alert=>!commitments?.some(entry=>entry.id===alert.id&&entry.statusName.toLowerCase()!=="agendado"));
 if(!visible.length)return null;
 return <aside className="agenda-persistent-alerts" aria-label="Compromissos aguardando atualização" role="status"><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><CalendarClock size={18}/><strong>Atualize o status da agenda</strong><b>{visible.length}</b></button>{expanded&&<div>{visible.map(alert=><article key={alert.id}><span><b>{alert.title}</b><small>Agendado há mais de 3 dias sem atualização.</small></span><a href={`/?mod=work&commitment=${encodeURIComponent(alert.id)}`}>Ver compromisso</a></article>)}</div>}</aside>;
}
