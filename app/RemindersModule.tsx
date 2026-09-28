"use client";

import { AlertTriangle, BellRing, Check, CheckCircle2, Clock3, Eye, Plus, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { ReminderContext } from "@/app/ReminderAction";

type WorkItem = { id:string; module:string; record_type:string; title:string; customer_name:string; owner:string; team:string; status:string; priority:string; due_at:string|null; description:string; version:number; updated_at:string; created_at:string };
type Employee = { id:string; displayName:string; email:string; departmentName:string; departmentNames:string[]; photoDataUrl:string; active:boolean };
type User = { email:string; displayName:string; department:string };
type Operate = (payload:Record<string,unknown>,success:string)=>Promise<{id?:string}|false>;

export type ReminderUrgency = "Informativo"|"Aviso"|"Atenção"|"Urgente";
export type ReminderDetail = {
  kind:"systemReminder";
  createdAt:string;
  createdBy:string;
  creatorEmail:string;
  title:string;
  summary:string;
  recipientId:string;
  recipientName:string;
  recipientEmail:string;
  remindAt:string;
  urgency:ReminderUrgency;
  sourceModule:string;
  sourceEntityId?:string;
  sourceClientId?:string;
  sourceCustomerName?:string;
  sourceTitle?:string;
  nextAlertAt:string;
  snoozeCount:number;
  seenAt?:string;
  seenBy?:string;
};

const URGENCIES: Array<{value:ReminderUrgency;description:string}> = [
  {value:"Informativo",description:"Informação sem urgência"},
  {value:"Aviso",description:"Lembrete importante"},
  {value:"Atenção",description:"Requer atenção prioritária"},
  {value:"Urgente",description:"Ação imediata"},
];
const priorityFor=(value:ReminderUrgency)=>({Informativo:"P3",Aviso:"P2",Atenção:"P1",Urgente:"P0"}[value]);
const localInput=(date:Date)=>{const offset=date.getTimezoneOffset()*60_000;return new Date(date.getTime()-offset).toISOString().slice(0,16)};
const dt=(value?:string|null)=>value?new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"—";
export const reminderTone=(urgency:ReminderUrgency)=>urgency.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
export function parseReminder(value:string):ReminderDetail|null{try{const entry=JSON.parse(value) as Partial<ReminderDetail>;return entry.kind==="systemReminder"?{kind:"systemReminder",createdAt:entry.createdAt??"",createdBy:entry.createdBy??"",creatorEmail:entry.creatorEmail??"",title:entry.title??"Lembrete",summary:entry.summary??"",recipientId:entry.recipientId??"",recipientName:entry.recipientName??"",recipientEmail:entry.recipientEmail??"",remindAt:entry.remindAt??"",urgency:entry.urgency??"Aviso",sourceModule:entry.sourceModule??"reminders",sourceEntityId:entry.sourceEntityId,sourceClientId:entry.sourceClientId,sourceCustomerName:entry.sourceCustomerName,sourceTitle:entry.sourceTitle,nextAlertAt:entry.nextAlertAt??entry.remindAt??"",snoozeCount:Number(entry.snoozeCount??0),seenAt:entry.seenAt,seenBy:entry.seenBy}:null}catch{return null}}

export function ReminderComposerModal({context,user,employees,busy,onClose,operate}:{context:ReminderContext;user:User;employees:Employee[];busy:boolean;onClose:()=>void;operate:Operate}){
  const sameDepartment=useMemo(()=>employees.filter(employee=>employee.active&&(employee.email===user.email||employee.departmentName===user.department||employee.departmentNames.includes(user.department))),[employees,user.department,user.email]);
  const preferred=sameDepartment.find(employee=>employee.email===context.recipientEmail||employee.displayName===context.recipientName)||sameDepartment.find(employee=>employee.email===user.email)||sameDepartment[0];
  const [recipientId,setRecipientId]=useState(preferred?.id??"");
  const [urgency,setUrgency]=useState<ReminderUrgency>("Aviso");
  const defaultDate=useMemo(()=>localInput(new Date(Date.now()+60*60_000)),[]);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const recipient=sameDepartment.find(employee=>employee.id===recipientId);if(!recipient)return;const remindAt=new Date(String(form.get("remindAt"))).toISOString();const title=String(form.get("title")||"").trim();const detail:ReminderDetail={kind:"systemReminder",createdAt:new Date().toISOString(),createdBy:user.displayName,creatorEmail:user.email,title,summary:String(form.get("summary")||"").trim(),recipientId:recipient.id,recipientName:recipient.displayName,recipientEmail:recipient.email,remindAt,urgency,sourceModule:context.module,sourceEntityId:context.entityId,sourceClientId:context.clientId,sourceCustomerName:context.customerName,sourceTitle:context.title,nextAlertAt:remindAt,snoozeCount:0};const validOriginId=context.entityId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(context.entityId)?context.entityId:undefined;const result=await operate({action:"createWorkItem",module:"reminders",recordType:"Lembrete",title,customerName:recipient.email,owner:user.displayName,team:user.department,status:"Pendente",priority:priorityFor(urgency),dueAt:remindAt,amountCents:0,description:JSON.stringify(detail),originType:context.module,originId:validOriginId},"Lembrete criado com sucesso.");if(result)onClose()};
  return <div className="modal-backdrop reminder-modal-backdrop" onMouseDown={event=>event.currentTarget===event.target&&onClose()}><section className="modal reminder-compose-modal" role="dialog" aria-modal="true" aria-label="Adicionar lembrete"><header className="modal-head"><div><span className="eyebrow">NOVO LEMBRETE</span><h2>Adicionar lembrete</h2><p>Avise você ou um colaborador do seu setor no dia e horário definidos.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></header><form className="form-grid" onSubmit={submit}><label>Data de criação<input value={new Date().toLocaleDateString("pt-BR")} readOnly/></label><label>Responsável *<select required value={recipientId} onChange={event=>setRecipientId(event.target.value)}>{sameDepartment.map(employee=><option value={employee.id} key={employee.id}>{employee.displayName}</option>)}</select><small>Somente colaboradores do setor {user.department}.</small></label><label className="wide">Título *<input name="title" required autoFocus defaultValue={context.title?`Lembrar: ${context.title}`:""} placeholder="O que precisa ser lembrado?"/></label><label className="wide">Resumo *<textarea name="summary" rows={4} required defaultValue={context.summary??""} placeholder="Contexto e ação esperada para este lembrete"/></label><label>Data e horário *<input name="remindAt" type="datetime-local" min={localInput(new Date())} defaultValue={defaultDate} required/></label><label>Tipo de lembrete *<select value={urgency} onChange={event=>setUrgency(event.target.value as ReminderUrgency)}>{URGENCIES.map(entry=><option key={entry.value}>{entry.value}</option>)}</select><small>{URGENCIES.find(entry=>entry.value===urgency)?.description}</small></label>{context.title&&<div className="reminder-source-preview wide"><BellRing/><span><small>VINCULADO A {context.module.toLocaleUpperCase("pt-BR")}</small><strong>{context.title}</strong></span></div>}<div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className={`primary-button reminder-submit ${reminderTone(urgency)}`} disabled={busy||!recipientId}><BellRing size={16}/>Criar lembrete</button></div></form></section></div>;
}

export function ReminderDueModal({item,detail,busy,onLater,onSeen}:{item:WorkItem;detail:ReminderDetail;busy:boolean;onLater:()=>void;onSeen:()=>void}){
  const Icon=detail.urgency==="Urgente"?ShieldAlert:detail.urgency==="Atenção"?AlertTriangle:BellRing;
  return <div className={`modal-backdrop reminder-alert-backdrop ${reminderTone(detail.urgency)}`}><section className={`modal reminder-alert-modal ${reminderTone(detail.urgency)}`} role="alertdialog" aria-modal="true" aria-label={detail.title}><div className="reminder-alert-icon"><Icon/></div><span className="reminder-alert-type">{detail.urgency}</span><h2>{detail.title}</h2><p>{detail.summary}</p><dl><div><dt>Responsável</dt><dd>{detail.recipientName}</dd></div><div><dt>Programado para</dt><dd>{dt(detail.remindAt)}</dd></div>{detail.sourceTitle&&<div><dt>Origem</dt><dd>{detail.sourceTitle}</dd></div>}</dl>{detail.snoozeCount>0&&<small className="reminder-snooze-count">Reexibido {detail.snoozeCount} vez(es)</small>}<div className="reminder-alert-actions"><button disabled={busy} onClick={onLater}><Clock3/>Ver mais tarde</button><button className="primary-button" disabled={busy} onClick={onSeen}><Check/>Visto</button></div><small>“Ver mais tarde” reapresenta este aviso em 1 hora.</small></section></div>;
}

export default function RemindersModule({items,employees,currentUser,busy,operate,onCreate}:{items:WorkItem[];employees:Employee[];currentUser:User;busy:boolean;operate:Operate;onCreate:(context:ReminderContext)=>void}){
  const [query,setQuery]=useState("");const [scope,setScope]=useState<"open"|"seen">("open");
  const reminders=useMemo(()=>items.map(item=>({item,detail:parseReminder(item.description)})).filter((entry):entry is {item:WorkItem;detail:ReminderDetail}=>Boolean(entry.detail)).filter(({detail})=>{const belongs=detail.recipientEmail===currentUser.email||detail.creatorEmail===currentUser.email;return belongs&&(scope==="seen"?Boolean(detail.seenAt):!detail.seenAt)}).filter(({detail})=>`${detail.title} ${detail.summary} ${detail.recipientName} ${detail.sourceTitle??""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))).sort((a,b)=>new Date(a.detail.nextAlertAt).getTime()-new Date(b.detail.nextAlertAt).getTime()),[items,currentUser.email,query,scope]);
  const open=items.filter(item=>{const d=parseReminder(item.description);return Boolean(d)&&!d?.seenAt&&(d?.creatorEmail===currentUser.email||d?.recipientEmail===currentUser.email)}).length;
  const seen=items.filter(item=>{const d=parseReminder(item.description);return Boolean(d?.seenAt)&&(d?.creatorEmail===currentUser.email||d?.recipientEmail===currentUser.email)}).length;
  const markSeen=(item:WorkItem,detail:ReminderDetail)=>{const next={...detail,seenAt:new Date().toISOString(),seenBy:currentUser.displayName};void operate({action:"updateWorkItem",id:item.id,title:item.title,owner:item.owner,amountCents:0,version:item.version,description:JSON.stringify(next)},"Lembrete marcado como visto.")};
  return <section className="reminders-page"><header className="module-page-header"><div className="module-page-title"><span className="module-page-title-icon"><BellRing/></span><span className="module-page-copy"><span className="eyebrow">PRODUTIVIDADE · LEMBRETES</span><h1>Lembretes</h1><p>Organize avisos pessoais e lembre colaboradores do seu setor.</p></span></div><div className="module-page-actions"><button className="primary-button" onClick={()=>onCreate({module:"reminders"})}><Plus/>Adicionar lembrete</button></div></header><section className="reminder-summary two-tabs"><button className={scope==="open"?"active":""} onClick={()=>setScope("open")}><BellRing/><span><small>ABERTOS</small><strong>{open}</strong></span></button><button className={scope==="seen"?"active":""} onClick={()=>setScope("seen")}><CheckCircle2/><span><small>VISTOS</small><strong>{seen}</strong></span></button></section><div className="reminder-toolbar"><label><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Pesquisar título, resumo ou responsável"/></label></div>{reminders.length===0?<div className="reminder-empty"><BellRing/><h2>Nenhum lembrete nesta visão</h2><p>Crie um lembrete para você ou para outro colaborador do seu setor.</p><button className="primary-button" onClick={()=>onCreate({module:"reminders"})}><Plus/>Adicionar lembrete</button></div>:<section className="reminder-grid">{reminders.map(({item,detail})=><article className={`reminder-card ${reminderTone(detail.urgency)} ${detail.seenAt?"seen":""}`} key={item.id}><header><span><i/><b>{detail.urgency}</b></span><time>{dt(detail.nextAlertAt)}</time></header><h2>{detail.title}</h2><p>{detail.summary}</p>{detail.sourceTitle&&<small className="reminder-card-source">{detail.sourceModule} · {detail.sourceTitle}</small>}<footer><span><small>Responsável</small><strong>{detail.recipientName}</strong></span><span><small>Criado por</small><strong>{detail.createdBy}</strong></span>{detail.seenAt?<em><Eye/>Visto por {detail.seenBy} em {dt(detail.seenAt)}</em>:<em><Clock3/>{new Date(detail.nextAlertAt)<=new Date()?"Aguardando confirmação":"Programado"}</em>}{!detail.seenAt&&detail.recipientEmail===currentUser.email&&<button className="reminder-seen-button" disabled={busy} onClick={()=>markSeen(item,detail)}><Check/>Marcar como visto</button>}{detail.creatorEmail===currentUser.email&&<button className="reminder-delete" title="Excluir lembrete" onClick={()=>void operate({action:"deleteWorkItem",id:item.id},"Lembrete excluído com sucesso.")}><Trash2/></button>}</footer></article>)}</section>}</section>;
}
