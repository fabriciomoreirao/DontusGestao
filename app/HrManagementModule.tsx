"use client";

import {
  AlertTriangle, BadgeCheck, BriefcaseBusiness, CalendarClock, Check, ChevronRight,
  FileImage, FileText, History, MessageSquareText, Plus, RotateCcw, Save, Settings,
  ShieldCheck, Upload, UserRound, UsersRound, X, XCircle,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type WorkItem = { id:string; module:string; record_type:string; title:string; customer_name:string; owner:string; status:string; amount_cents:number; description:string; version:number; created_at:string; updated_at:string };
type Catalog = { id:string; catalog:string; name:string; active:boolean };
type CurrentUser = { displayName:string; email:string; isCoordinator:boolean };
type OperationResult = { id?:string } | false;
type Operate = (payload:Record<string,unknown>, success:string)=>Promise<OperationResult>;
type HrComment = { id:string; type:string; text:string; at:string; author:string };
type HrVacation = { id:string; entitlementYear:number; startDate:string; endDate:string; days:number; status:"Planejada"|"Concluída"|"Cancelada"; createdAt:string; updatedAt:string; author:string };
type HrDocument = { id:string; type:string; name:string; dataUrl:string; uploadedAt:string; uploadedBy:string };
type HrTermination = { type:"Demissão"|"Cancelamento de contrato"|"Pedido de demissão"; reason:string; date:string; by:string; at:string; duringExperience?:boolean };
type HrReadmission = { date:string; by:string; at:string };
type HrProfile = {
  kind:"hrEmployee"; employeeId:string; fullName:string; email:string; jobTitle:string;
  department:string; startedAt:string; birthDate?:string; photoDataUrl?:string;
  comments:HrComment[]; vacations:HrVacation[]; documents:HrDocument[];
  termination:HrTermination|null; readmissions:HrReadmission[];
};

const STAGES=["Experiência","Ativos","Desligados"] as const;
const now=()=>new Date().toISOString();
const today=()=>now().slice(0,10);
const formatDate=(value?:string)=>value?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short"}).format(new Date(`${value.slice(0,10)}T12:00:00`)):"—";
const formatDateTime=(value?:string)=>value?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"—";
const daysBetween=(start?:string,end?:string)=>{if(!start)return 0;const first=new Date(`${start.slice(0,10)}T12:00:00`).getTime();const last=new Date(`${(end||today()).slice(0,10)}T12:00:00`).getTime();return Math.max(0,Math.floor((last-first)/86400000)+1)};
const fullYears=(start?:string)=>{if(!start)return 0;const birth=new Date(`${start.slice(0,10)}T12:00:00`);const current=new Date();let years=current.getFullYear()-birth.getFullYear();if(current.getMonth()<birth.getMonth()||(current.getMonth()===birth.getMonth()&&current.getDate()<birth.getDate()))years--;return Math.max(0,years)};
const addYears=(start:string,years:number)=>{const result=new Date(`${start.slice(0,10)}T12:00:00`);result.setFullYear(result.getFullYear()+years);return result};
const humanTenure=(start?:string)=>{if(!start)return "Data de admissão não informada";const days=daysBetween(start);const years=Math.floor(days/365);const months=Math.floor((days%365)/30);return years?`${years} ano(s) e ${months} mês(es) de empresa`:`${months} mês(es) e ${days%30} dia(s) de empresa`};
const parse=(value:string):HrProfile|null=>{try{const data=JSON.parse(value) as Partial<HrProfile>;if(data.kind!=="hrEmployee")return null;const vacations=Array.isArray(data.vacations)?data.vacations.map(entry=>entry.status==="Planejada"&&entry.endDate<today()?{...entry,status:"Concluída" as const,updatedAt:now()}:entry):[];return {...data,comments:Array.isArray(data.comments)?data.comments:[],vacations,documents:Array.isArray(data.documents)?data.documents:[],termination:data.termination??null,readmissions:Array.isArray(data.readmissions)?data.readmissions:[]} as HrProfile}catch{return null}};

export default function HrManagementModule({items,catalogs,currentUser,busy,canEdit,operate,onOpenSettings}:{items:WorkItem[];catalogs:Catalog[];currentUser:CurrentUser;busy:boolean;canEdit:boolean;operate:Operate;onOpenSettings?:()=>void}){
  const [stage,setStage]=useState<(typeof STAGES)[number]>("Experiência");
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<WorkItem|null>(null);
  const records=useMemo(()=>items.filter(item=>item.module==="hr").map(item=>({item,profile:parse(item.description)})).filter((entry):entry is {item:WorkItem;profile:HrProfile}=>Boolean(entry.profile)),[items]);
  const visible=records.filter(({item,profile})=>item.status===stage&&`${profile.fullName} ${profile.email} ${profile.jobTitle} ${profile.department}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));
  return <section className="hr-module task-visual-standard">
    <header className="module-page-header"><div className="module-page-title"><span className="module-page-title-icon hr-title-icon"><UsersRound size={21}/></span><span className="module-page-copy"><span className="eyebrow">PESSOAS · CICLO DO COLABORADOR</span><h1>Gestão RH</h1><p>Experiência, histórico profissional, férias, documentos e desligamentos em um só lugar.</p></span></div>{onOpenSettings&&<div className="module-page-actions"><button className="secondary-button" onClick={onOpenSettings}><Settings size={16}/> Configurações</button></div>}</header>
    <section className="hr-kpis"><article><UsersRound/><span><small>Em experiência</small><strong>{records.filter(entry=>entry.item.status==="Experiência").length}</strong></span></article><article><BadgeCheck/><span><small>Ativos</small><strong>{records.filter(entry=>entry.item.status==="Ativos").length}</strong></span></article><article><CalendarClock/><span><small>Alertas de férias</small><strong>{records.filter(entry=>entry.item.status==="Ativos"&&vacationAlert(entry.profile).level!=="none").length}</strong></span></article><article><History/><span><small>Desligados</small><strong>{records.filter(entry=>entry.item.status==="Desligados").length}</strong></span></article></section>
    <nav className="hr-tabs">{STAGES.map(value=><button key={value} className={stage===value?"active":""} onClick={()=>setStage(value)}>{value}<b>{records.filter(entry=>entry.item.status===value).length}</b></button>)}</nav>
    <div className="hr-toolbar"><label><UserRound size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar colaborador, função ou setor"/></label><strong>{visible.length} colaborador(es)</strong></div>
    <section className="hr-board">{visible.length===0?<div className="hr-empty"><ShieldCheck/><h3>Nenhum colaborador nesta etapa</h3><p>Novos colaboradores cadastrados aparecem automaticamente em Experiência.</p></div>:visible.map(({item,profile})=><HrEmployeeCard key={item.id} item={item} profile={profile} onOpen={()=>setSelected(item)}/>)}</section>
    {selected&&parse(selected.description)&&<HrEmployeeDrawer item={selected} initial={parse(selected.description)!} catalogs={catalogs} currentUser={currentUser} busy={busy} canEdit={canEdit} operate={operate} onClose={()=>setSelected(null)} onChanged={next=>setSelected(next)}/>} 
  </section>;
}

function HrEmployeeCard({item,profile,onOpen}:{item:WorkItem;profile:HrProfile;onOpen:()=>void}){
  const experienceDays=daysBetween(profile.startedAt);
  const alert=item.status==="Ativos"?vacationAlert(profile):null;
  return <article className="hr-employee-card"><button onClick={onOpen}><header><span className="hr-avatar" style={profile.photoDataUrl?{backgroundImage:`url("${profile.photoDataUrl}")`}:undefined}>{!profile.photoDataUrl&&<UserRound/>}</span><span><small>{item.status}</small><h3>{profile.fullName}</h3><p>{profile.jobTitle||"Função não informada"}</p></span><ChevronRight/></header><div className="hr-card-meta"><span><BriefcaseBusiness/><b>{profile.department||"Sem setor"}</b></span><span><CalendarClock/><b>{item.status==="Experiência"?`${experienceDays} dia(s) em experiência`:humanTenure(profile.startedAt)}</b></span></div>{item.status==="Experiência"&&experienceDays>=23&&experienceDays<30&&<div className="hr-card-alert medium"><CalendarClock/> Contrato de 30 dias próximo da renovação</div>}{item.status==="Experiência"&&experienceDays>=30&&<div className="hr-card-alert high"><AlertTriangle/> Contrato de 30 dias a ser renovado</div>}{alert&&alert.level!=="none"&&<div className={`hr-card-alert ${alert.level}`}><AlertTriangle/>{alert.text}</div>}{item.status==="Desligados"&&profile.termination&&<div className="hr-card-alert high"><XCircle/>{profile.termination.duringExperience?"Desligado em experiência":profile.termination.type} em {formatDate(profile.termination.date)}</div>}<footer><span><MessageSquareText/>{profile.comments.length} interação(ões)</span><span><FileText/>{profile.documents.length} documento(s)</span></footer></button></article>;
}

function HrEmployeeDrawer({item,initial,catalogs,currentUser,busy,canEdit,operate,onClose,onChanged}:{item:WorkItem;initial:HrProfile;catalogs:Catalog[];currentUser:CurrentUser;busy:boolean;canEdit:boolean;operate:Operate;onClose:()=>void;onChanged:(item:WorkItem)=>void}){
  const [profile,setProfile]=useState(initial);
  const [version,setVersion]=useState(item.version);
  const [commentType,setCommentType]=useState("");
  const [comment,setComment]=useState("");
  const [vacationOpen,setVacationOpen]=useState(false);
  const [documentOpen,setDocumentOpen]=useState(false);
  const [terminationType,setTerminationType]=useState<HrTermination["type"]|null>(null);
  const [readmissionOpen,setReadmissionOpen]=useState(false);
  const options=(catalog:string)=>catalogs.filter(entry=>entry.active&&entry.catalog===catalog).map(entry=>entry.name);
  const save=async(next:HrProfile,message:string)=>{const result=await operate({action:"updateWorkItem",id:item.id,title:next.fullName,owner:item.owner,customerName:next.fullName,amountCents:item.amount_cents,version,description:JSON.stringify(next)},message);if(result){setProfile(next);setVersion(current=>current+1);onChanged({...item,title:next.fullName,customer_name:next.fullName,description:JSON.stringify(next),version:version+1});return true}return false};
  const move=async(nextStatus:string,baseVersion=version)=>{const result=await operate({action:"transitionWorkItem",id:item.id,nextStatus,version:baseVersion,confirmed:true,boardMove:true},`Colaborador direcionado para ${nextStatus}.`);if(result){onClose();return true}return false};
  const addComment=async()=>{if(!comment.trim()||!commentType)return;const next={...profile,comments:[...profile.comments,{id:crypto.randomUUID(),type:commentType,text:comment.trim(),at:now(),author:currentUser.displayName}]};if(await save(next,"Interação registrada no histórico do colaborador.")){setComment("");setCommentType("")}};
  const approve=()=>void move("Ativos");
  const reject=()=>setTerminationType("Cancelamento de contrato");
  const updateVacation=(vacation:HrVacation,status:HrVacation["status"])=>void save({...profile,vacations:profile.vacations.map(entry=>entry.id===vacation.id?{...entry,status,updatedAt:now()}:entry)},status==="Concluída"?"Período de férias concluído.":"Período de férias cancelado.");
  const alert=vacationAlert(profile);
  return <div className="drawer-backdrop" onMouseDown={event=>event.currentTarget===event.target&&onClose()}><aside className="journey-drawer hr-drawer" onMouseDown={event=>event.stopPropagation()}><header><div className="hr-drawer-identity"><span className="hr-avatar large" style={profile.photoDataUrl?{backgroundImage:`url("${profile.photoDataUrl}")`}:undefined}>{!profile.photoDataUrl&&<UserRound/>}</span><span><span className="eyebrow">GESTÃO RH · {item.status}</span><h2>{profile.fullName}</h2><p>{profile.jobTitle||"Função não informada"} · {profile.department||"Setor não informado"}</p></span></div><button className="icon-button" onClick={onClose}><X/></button></header><div className="journey-drawer-body hr-drawer-body">
    <section className="hr-profile-summary"><div><small>E-mail</small><strong>{profile.email||"—"}</strong></div><div><small>Admissão</small><strong>{formatDate(profile.startedAt)}</strong></div><div><small>Tempo de empresa</small><strong>{humanTenure(profile.startedAt)}</strong></div><div><small>Experiência</small><strong>{daysBetween(profile.startedAt)} dia(s)</strong></div>{profile.readmissions.length>0&&<div><small>Última readmissão</small><strong>{formatDate(profile.readmissions.at(-1)?.date)}</strong></div>}</section>
    {item.status==="Experiência"&&daysBetween(profile.startedAt)>=23&&<section className={`hr-prominent-alert ${daysBetween(profile.startedAt)>=30?"high":"medium"}`}><AlertTriangle/><div><h3>Contrato de 30 dias {daysBetween(profile.startedAt)>=30?"a ser renovado":"próximo da renovação"}</h3><p>O colaborador está há {daysBetween(profile.startedAt)} dias em experiência. Registre a decisão abaixo.</p></div></section>}
    {item.status==="Ativos"&&alert.level!=="none"&&<section className={`hr-prominent-alert ${alert.level}`}><AlertTriangle/><div><h3>{alert.title}</h3><p>{alert.text}. O alerta somente será concluído quando houver 30 dias de férias concluídos no período aquisitivo.</p></div></section>}
    <section className="hr-comments"><header><div><h3><MessageSquareText/> Interações e comentários</h3><p>Histórico permanente desde o primeiro dia na empresa.</p></div><b>{profile.comments.length}</b></header>{canEdit&&<div className="hr-comment-form"><label>Tipo de comunicação<select value={commentType} onChange={event=>setCommentType(event.target.value)}><option value="">Selecione o tipo</option>{options("hrCommunicationType").map(value=><option key={value}>{value}</option>)}</select></label><label>Comentário<textarea rows={3} value={comment} onChange={event=>setComment(event.target.value)} placeholder="Registre a interação, orientação ou acompanhamento"/></label><button className="primary-button" disabled={busy||!commentType||!comment.trim()} onClick={()=>void addComment()}><MessageSquareText size={15}/> Registrar comentário</button></div>}<div className="hr-timeline">{profile.comments.length===0?<p className="empty-copy">Nenhuma interação registrada.</p>:profile.comments.slice().reverse().map(entry=><article key={entry.id}><span><b>{entry.type}</b><small>{formatDateTime(entry.at)}</small></span><p>{entry.text}</p><em>por {entry.author}</em></article>)}</div></section>
    {item.status==="Experiência"&&canEdit&&<section className="hr-experience-decision"><div><h3>Decisão da experiência</h3><p>Aprovar ativa o colaborador; reprovar registra o desligamento em experiência.</p></div><button className="danger-button" disabled={busy} onClick={reject}><XCircle/> Reprovar</button><button className="primary-button" disabled={busy} onClick={approve}><BadgeCheck/> Aprovar colaborador</button></section>}
    {(item.status==="Ativos"||item.status==="Desligados")&&<VacationSection profile={profile} canEdit={canEdit&&item.status==="Ativos"} busy={busy} onAdd={()=>setVacationOpen(true)} onUpdate={updateVacation}/>} 
    {(item.status==="Ativos"||item.status==="Desligados")&&<DocumentSection profile={profile} canEdit={canEdit&&item.status==="Ativos"} onAdd={()=>setDocumentOpen(true)}/>} 
    {item.status==="Ativos"&&canEdit&&<section className="hr-termination-panel"><div><h3>Encerramento do vínculo</h3><p>O motivo, a data e todo o histórico permanecerão disponíveis para consulta.</p></div>{(["Demissão","Cancelamento de contrato","Pedido de demissão"] as const).map(value=><button key={value} className="secondary-button danger-action" disabled={busy} onClick={()=>setTerminationType(value)}>{value}</button>)}</section>}
    {item.status==="Desligados"&&<section className="hr-terminated-panel"><XCircle/><div><h3>{profile.termination?.type||"Colaborador desligado"}</h3><p>{profile.termination?`${profile.termination.reason} · ${formatDate(profile.termination.date)}`:"Histórico de desligamento preservado."}</p></div>{canEdit&&<button className="primary-button" onClick={()=>setReadmissionOpen(true)}><RotateCcw/> Reativar colaborador</button>}</section>}
  </div></aside>
  {vacationOpen&&<VacationModal profile={profile} busy={busy} onClose={()=>setVacationOpen(false)} onSave={async vacation=>{if(await save({...profile,vacations:[...profile.vacations,vacation]},"Período de férias adicionado."))setVacationOpen(false)}}/>}
  {documentOpen&&<DocumentModal types={options("hrDocumentType")} currentUser={currentUser} busy={busy} onClose={()=>setDocumentOpen(false)} onSave={async document=>{if(await save({...profile,documents:[...profile.documents,document]},"Documento registrado no histórico do colaborador."))setDocumentOpen(false)}}/>}
  {terminationType&&<TerminationModal type={terminationType} reasons={options("hrTerminationReason")} busy={busy} onClose={()=>setTerminationType(null)} onSave={async termination=>{const next={...profile,termination:{...termination,duringExperience:item.status==="Experiência"}};if(await save(next,"Desligamento registrado no histórico.")){await move("Desligados",version+1);setTerminationType(null)}}}/>} 
  {readmissionOpen&&<ReadmissionModal busy={busy} onClose={()=>setReadmissionOpen(false)} onSave={async date=>{const next={...profile,termination:null,readmissions:[...profile.readmissions,{date,by:currentUser.displayName,at:now()}],comments:[...profile.comments,{id:crypto.randomUUID(),type:"Readmissão",text:`Colaborador reativado com data de readmissão em ${formatDate(date)}.`,at:now(),author:currentUser.displayName}]};if(await save(next,"Readmissão registrada.")){await move("Ativos",version+1);setReadmissionOpen(false)}}}/>} 
  </div>;
}

function VacationSection({profile,canEdit,busy,onAdd,onUpdate}:{profile:HrProfile;canEdit:boolean;busy:boolean;onAdd:()=>void;onUpdate:(vacation:HrVacation,status:HrVacation["status"])=>void}){
  const years=Math.max(1,fullYears(profile.startedAt));
  return <section className="hr-management-section"><header><div><h3><CalendarClock/> Gestão de férias</h3><p>Controle dos 30 dias por período aquisitivo.</p></div>{canEdit&&<button className="secondary-button" onClick={onAdd}><Plus/> Adicionar período</button>}</header><div className="hr-entitlements">{Array.from({length:years},(_,index)=>index+1).map(year=>{const completed=profile.vacations.filter(entry=>entry.entitlementYear===year&&entry.status==="Concluída").reduce((sum,entry)=>sum+entry.days,0);return <span className={completed>=30?"complete":"pending"} key={year}><b>{year}º ano</b><small>{Math.min(30,completed)}/30 dias concluídos</small>{completed>=30?<Check/>:<CalendarClock/>}</span>})}</div><div className="hr-vacation-list">{profile.vacations.length===0?<p className="empty-copy">Nenhum período de férias cadastrado.</p>:profile.vacations.slice().reverse().map(entry=><article key={entry.id}><span><b>{entry.entitlementYear}º ano · {entry.days} dia(s)</b><small>{formatDate(entry.startDate)} até {formatDate(entry.endDate)}</small></span><em className={entry.status.toLowerCase()}>{entry.status}</em>{canEdit&&entry.status==="Planejada"&&<span className="hr-row-actions"><button disabled={busy} onClick={()=>onUpdate(entry,"Concluída")}><Check/> Concluída</button><button disabled={busy} onClick={()=>onUpdate(entry,"Cancelada")}><X/> Cancelar</button></span>}</article>)}</div></section>;
}

function DocumentSection({profile,canEdit,onAdd}:{profile:HrProfile;canEdit:boolean;onAdd:()=>void}){
  return <section className="hr-management-section"><header><div><h3><FileImage/> Gestão de documentos</h3><p>Imagens e comprovantes vinculados ao histórico do colaborador.</p></div>{canEdit&&<button className="secondary-button" onClick={onAdd}><Upload/> Subir documento</button>}</header><div className="hr-document-grid">{profile.documents.length===0?<p className="empty-copy">Nenhum documento registrado.</p>:profile.documents.slice().reverse().map(entry=><a key={entry.id} href={entry.dataUrl} download={entry.name} title="Abrir ou baixar documento"><FileImage/><span><b>{entry.type}</b><small>{entry.name}</small><em>{formatDateTime(entry.uploadedAt)} · {entry.uploadedBy}</em></span></a>)}</div></section>;
}

function VacationModal({profile,busy,onClose,onSave}:{profile:HrProfile;busy:boolean;onClose:()=>void;onSave:(vacation:HrVacation)=>Promise<void>}){
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget);const startDate=String(data.get("startDate")||"");const endDate=String(data.get("endDate")||"");const days=daysBetween(startDate,endDate);if(!startDate||!endDate||days<=0)return;void onSave({id:crypto.randomUUID(),entitlementYear:Number(data.get("entitlementYear")||1),startDate,endDate,days,status:"Planejada",createdAt:now(),updatedAt:now(),author:"RH"})};
  const maxYear=Math.max(1,fullYears(profile.startedAt));
  return <div className="modal-backdrop nested-modal"><section className="modal hr-small-modal"><header className="modal-head"><div><span className="eyebrow">GESTÃO DE FÉRIAS</span><h2>Adicionar período</h2></div><button className="icon-button" onClick={onClose}><X/></button></header><form className="form-grid" onSubmit={submit}><label>Período aquisitivo<select name="entitlementYear">{Array.from({length:maxYear},(_,index)=>index+1).map(value=><option key={value} value={value}>{value}º ano</option>)}</select></label><span/><label>Data de início<input name="startDate" type="date" required/></label><label>Data de fim<input name="endDate" type="date" required/></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><Save/> Salvar período</button></div></form></section></div>;
}

function DocumentModal({types,currentUser,busy,onClose,onSave}:{types:string[];currentUser:CurrentUser;busy:boolean;onClose:()=>void;onSave:(document:HrDocument)=>Promise<void>}){
  const [type,setType]=useState("");const [file,setFile]=useState<File|null>(null);const [error,setError]=useState("");
  const submit=()=>{if(!type||!file)return;if(file.size>3*1024*1024){setError("O arquivo deve ter no máximo 3 MB.");return}const reader=new FileReader();reader.onload=()=>void onSave({id:crypto.randomUUID(),type,name:file.name,dataUrl:String(reader.result),uploadedAt:now(),uploadedBy:currentUser.displayName});reader.readAsDataURL(file)};
  return <div className="modal-backdrop nested-modal"><section className="modal hr-small-modal"><header className="modal-head"><div><span className="eyebrow">GESTÃO DE DOCUMENTOS</span><h2>Subir documento</h2></div><button className="icon-button" onClick={onClose}><X/></button></header><div className="form-grid"><label className="wide">Tipo de documento<select value={type} onChange={event=>setType(event.target.value)}><option value="">Selecionar</option>{types.map(value=><option key={value}>{value}</option>)}</select></label><label className="wide hr-file-input"><Upload/> Selecione uma imagem ou PDF<input type="file" accept="image/*,.pdf" onChange={event=>setFile(event.target.files?.[0]??null)}/><small>{file?.name||"Nenhum arquivo selecionado"}</small></label>{error&&<p className="form-error wide">{error}</p>}<div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="primary-button" disabled={busy||!type||!file} onClick={submit}><Upload/> Registrar documento</button></div></div></section></div>;
}

function TerminationModal({type,reasons,busy,onClose,onSave}:{type:HrTermination["type"];reasons:string[];busy:boolean;onClose:()=>void;onSave:(termination:HrTermination)=>Promise<void>}){
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget);void onSave({type,reason:String(data.get("reason")||""),date:String(data.get("date")||today()),by:"RH",at:now()})};
  return <div className="modal-backdrop nested-modal"><section className="modal hr-small-modal"><header className="modal-head"><div><span className="eyebrow">ENCERRAMENTO DO VÍNCULO</span><h2>{type}</h2><p>Esta ação preservará todo o histórico na etapa Desligados.</p></div><button className="icon-button" onClick={onClose}><X/></button></header><form className="form-grid" onSubmit={submit}><label className="wide">Motivo<select name="reason" required><option value="">Selecionar motivo</option>{reasons.map(value=><option key={value}>{value}</option>)}</select></label><label>Data<input name="date" type="date" required defaultValue={today()}/></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="danger-button" disabled={busy}><XCircle/> Confirmar {type.toLocaleLowerCase("pt-BR")}</button></div></form></section></div>;
}

function ReadmissionModal({busy,onClose,onSave}:{busy:boolean;onClose:()=>void;onSave:(date:string)=>Promise<void>}){
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();void onSave(String(new FormData(event.currentTarget).get("date")||today()))};
  return <div className="modal-backdrop nested-modal"><section className="modal hr-small-modal"><header className="modal-head"><div><span className="eyebrow">READMISSÃO</span><h2>Reativar colaborador</h2><p>Informe a data de readmissão para devolver o card à etapa Ativos.</p></div><button className="icon-button" onClick={onClose}><X/></button></header><form className="form-grid" onSubmit={submit}><label className="wide">Data de readmissão<input name="date" type="date" required defaultValue={today()}/></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><RotateCcw/> Reativar</button></div></form></section></div>;
}

function vacationAlert(profile:HrProfile):{level:"none"|"medium"|"high";title:string;text:string}{
  if(!profile.startedAt)return{level:"none",title:"",text:""};
  const years=Math.max(0,fullYears(profile.startedAt));
  for(let year=1;year<=years;year++){
    const completed=profile.vacations.filter(entry=>entry.entitlementYear===year&&entry.status==="Concluída").reduce((sum,entry)=>sum+entry.days,0);
    if(completed>=30)continue;
    const deadline=addYears(profile.startedAt,year+1);
    const remaining=Math.ceil((deadline.getTime()-Date.now())/86400000);
    if(remaining<=90)return{level:"high",title:`Férias do ${year}º ano em alerta crítico`,text:remaining>=0?`Restam ${remaining} dia(s) para completar 30 dias antes de dois anos`:`Prazo ultrapassado há ${Math.abs(remaining)} dia(s)`};
    return{level:"medium",title:`Férias do ${year}º ano disponíveis`,text:`Há ${completed}/30 dias concluídos neste período`};
  }
  return{level:"none",title:"",text:""};
}
