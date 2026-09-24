"use client";

import { Activity, BadgeCheck, BriefcaseBusiness, CalendarDays, Camera, Code2, Headphones, ListTodo, Save, Sparkles, UserRound, UsersRound, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

type Employee={id:string;displayName:string;email:string;birthDate:string|null;departmentName:string;departmentNames:string[];photoDataUrl:string;jobTitle:string;isCoordinator:boolean;subordinateUserIds:string[]};
type WorkItem={id:string;module:string;record_type:string;title:string;owner:string;description:string;version:number};
type OperationResult={id?:string}|false;
type ProfileData={kind:"employeeProfile";employeeId:string;coverDataUrl:string;bio:string;phrase:string;updatedAt:string;updatedBy:string};

function parseProfile(raw:string):ProfileData|null{try{const value=JSON.parse(raw) as Partial<ProfileData>;return value.kind==="employeeProfile"&&value.employeeId?{kind:"employeeProfile",employeeId:value.employeeId,coverDataUrl:value.coverDataUrl??"",bio:value.bio??"",phrase:value.phrase??"",updatedAt:value.updatedAt??"",updatedBy:value.updatedBy??""}:null}catch{return null}}
function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase()}
function birthday(value:string|null){return value?new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"long"}).format(new Date(`${value}T12:00:00`)):"Não informado"}

export default function EmployeeProfileDrawer({employee,employees,items,currentUser,busy,editable,taskCount=0,operate,onClose}:{employee:Employee;employees:Employee[];items:WorkItem[];currentUser:{displayName:string;email:string;isCoordinator:boolean;role:string};busy:boolean;editable:boolean;taskCount?:number;operate:(payload:Record<string,unknown>,success:string)=>Promise<OperationResult>;onClose:()=>void}){
  const record=useMemo(()=>items.find(item=>item.record_type==="Perfil de colaborador"&&parseProfile(item.description)?.employeeId===employee.id),[employee.id,items]);
  const saved=record?parseProfile(record.description):null;
  const [coverDataUrl,setCoverDataUrl]=useState(saved?.coverDataUrl??"");
  const [bio,setBio]=useState(saved?.bio??"");
  const [phrase,setPhrase]=useState(saved?.phrase??"");
  const [error,setError]=useState("");
  const fileInput=useRef<HTMLInputElement>(null);
  const supervisor=employees.find(entry=>entry.subordinateUserIds?.includes(employee.id));
  const canEdit=editable&&employee.email===currentUser.email;
  const assigned=items.filter(item=>item.owner===employee.displayName);
  const serviceCount=assigned.filter(item=>item.module==="support"&&/atendimento/i.test(item.record_type)).length;
  const trackingCount=assigned.filter(item=>{if(item.module!=="cs")return false;try{const value=JSON.parse(item.description) as {kind?:string;phase?:string};return value.kind==="csJourney"&&!["finished","cancelled","cancelledWithoutTraining"].includes(value.phase??"")}catch{return false}}).length;
  const developmentCount=assigned.filter(item=>item.module==="ti").length;
  const upload=(file?:File)=>{setError("");if(!file)return;if(!file.type.startsWith("image/")){setError("Selecione uma imagem válida.");return}if(file.size>2*1024*1024){setError("A capa deve ter no máximo 2 MB.");return}const reader=new FileReader();reader.onload=()=>setCoverDataUrl(String(reader.result??""));reader.readAsDataURL(file)};
  const save=async()=>{const detail:ProfileData={kind:"employeeProfile",employeeId:employee.id,coverDataUrl,bio:bio.trim(),phrase:phrase.trim(),updatedAt:new Date().toISOString(),updatedBy:currentUser.displayName};const payload=record?{action:"updateWorkItem",id:record.id,title:`Perfil · ${employee.displayName}`,owner:employee.displayName,customerName:employee.displayName,amountCents:0,version:record.version,description:JSON.stringify(detail)}:{action:"createWorkItem",module:"internalChat",recordType:"Perfil de colaborador",title:`Perfil · ${employee.displayName}`,customerName:employee.displayName,owner:employee.displayName,team:employee.departmentName||"Dontus",status:"Ativo",priority:"P4",amountCents:0,description:JSON.stringify(detail)};await operate(payload,"Perfil do colaborador atualizado.")};
  return <div className="employee-profile-backdrop" onMouseDown={event=>event.currentTarget===event.target&&onClose()}><aside className="employee-profile-drawer">
    <header className="employee-profile-cover" data-preview-image={coverDataUrl||undefined} aria-label={coverDataUrl?`Capa do perfil de ${employee.displayName}`:undefined} style={coverDataUrl?{backgroundImage:`linear-gradient(rgba(3,12,24,.12),rgba(3,12,24,.76)),url("${coverDataUrl}")`}:undefined}><button className="employee-profile-close" onClick={onClose} aria-label="Fechar perfil"><X size={19}/></button>{canEdit&&<><input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>upload(event.target.files?.[0])}/><button className="employee-cover-upload" onClick={()=>fileInput.current?.click()}><Camera size={15}/> {coverDataUrl?"Trocar capa":"Adicionar capa"}</button></>}</header>
    <div className="employee-profile-body"><div className={`employee-profile-avatar ${employee.photoDataUrl?"has-photo":""}`} style={employee.photoDataUrl?{backgroundImage:`url("${employee.photoDataUrl}")`}:undefined}>{!employee.photoDataUrl&&(initials(employee.displayName)||<UserRound/>)}{employee.isCoordinator&&<i><BadgeCheck size={16}/></i>}</div><div className="employee-profile-heading"><span className="eyebrow">PERFIL DO COLABORADOR</span><h2>{employee.displayName}</h2><p>{employee.jobTitle||employee.departmentName||"Colaborador Dontus"}</p></div>
      <section className="employee-profile-facts"><article><CalendarDays/><span><small>Aniversário</small><strong>{birthday(employee.birthDate)}</strong></span></article><article><BriefcaseBusiness/><span><small>Departamento</small><strong>{employee.departmentNames?.join(" · ")||employee.departmentName||"Não informado"}</strong></span></article><article><UsersRound/><span><small>Supervisor</small><strong>{supervisor?.displayName||"Não vinculado"}</strong></span></article></section>
      <section className="employee-profile-metrics"><article><Headphones/><span><strong>{serviceCount}</strong><small>Atendimentos</small></span></article><article><Activity/><span><strong>{trackingCount}</strong><small>Em acompanhamento</small></span></article><article><Code2/><span><strong>{developmentCount}</strong><small>Desenvolvimento</small></span></article><article><ListTodo/><span><strong>{taskCount}</strong><small>Tarefas pendentes</small></span></article></section>
      <section className="employee-profile-quote"><Sparkles size={18}/>{canEdit?<textarea value={phrase} maxLength={180} onChange={event=>setPhrase(event.target.value)} placeholder="Adicione uma frase que representa você..."/>:<p>{phrase||"Nenhuma frase adicionada."}</p>}</section>
      <label className="employee-profile-bio"><span>Bio</span>{canEdit?<textarea value={bio} maxLength={900} rows={7} onChange={event=>setBio(event.target.value)} placeholder="Conte um pouco sobre sua experiência, responsabilidades e interesses."/>:<p>{bio||"Bio ainda não preenchida."}</p>}</label>
      {error&&<p className="employee-profile-error">{error}</p>}{canEdit&&<button className="primary-button employee-profile-save" disabled={busy} onClick={()=>void save()}><Save size={16}/>{busy?"Salvando...":"Salvar perfil"}</button>}
    </div>
  </aside></div>;
}
