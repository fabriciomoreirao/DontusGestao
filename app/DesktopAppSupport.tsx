"use client";

import { BellRing, Download, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { registerDesktopWorker, updateDesktopBadge } from "@/lib/desktop-notifications";

type InstallEvent = Event & { prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}> };
const DesktopContext=createContext<{prompt:InstallEvent|null;installed:boolean;clearPrompt:()=>void}>({prompt:null,installed:false,clearPrompt:()=>{}});
const readPermission=():NotificationPermission|"unsupported"=>"Notification" in window?Notification.permission:"unsupported";
const serverPermission=()=>"unsupported" as const;
const subscribePermission=(notify:()=>void)=>{window.addEventListener("focus",notify);window.addEventListener("dontus-notification-permission",notify);return()=>{window.removeEventListener("focus",notify);window.removeEventListener("dontus-notification-permission",notify);};};
export function DesktopAppProvider({children}:{children:ReactNode}) {
  const [prompt,setPrompt]=useState<InstallEvent|null>(null);
  const [installed,setInstalled]=useState(false);
  useEffect(()=>{
    void registerDesktopWorker();
    const mode=window.matchMedia("(display-mode: standalone)");
    const update=()=>setInstalled(mode.matches);
    const available=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent);};
    const complete=()=>{setInstalled(true);setPrompt(null);};
    update();window.addEventListener("beforeinstallprompt",available);window.addEventListener("appinstalled",complete);mode.addEventListener("change",update);
    return()=>{window.removeEventListener("beforeinstallprompt",available);window.removeEventListener("appinstalled",complete);mode.removeEventListener("change",update);};
  },[]);
  return <DesktopContext.Provider value={{prompt,installed,clearPrompt:()=>setPrompt(null)}}>{children}</DesktopContext.Provider>;
}

export default function DesktopAppControls({unreadCount}:{unreadCount:number}) {
  const {prompt,installed,clearPrompt}=useContext(DesktopContext);
  const [open,setOpen]=useState(false);
  const permission=useSyncExternalStore(subscribePermission,readPermission,serverPermission);
  const [message,setMessage]=useState("");
  const title=useRef("");
  useEffect(()=>{
    title.current=document.title;
    return()=>{document.title=title.current;void updateDesktopBadge(0);};
  },[]);
  useEffect(()=>{
    void updateDesktopBadge(unreadCount);
    document.title=unreadCount>0?`(${unreadCount}) ${title.current}`:title.current;
    const icons=[...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
    const originals=icons.map(icon=>icon.href);
    if(unreadCount>0){
      const count=unreadCount>99?"99+":String(unreadCount);
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#112033"/><path d="M16 18h15a14 14 0 0 1 0 28H16v-9h6v3h9a8 8 0 0 0 0-16H16z" fill="white"/><circle cx="47" cy="17" r="17" fill="#dc2626"/><text x="47" y="22" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="white">${count}</text></svg>`;
      icons.forEach(icon=>icon.href=`data:image/svg+xml,${encodeURIComponent(svg)}`);
    }
    return()=>{icons.forEach((icon,index)=>icon.href=originals[index]);};
  },[unreadCount]);
  const install=async()=>{
    if(!prompt){setOpen(true);return;}
    try{await prompt.prompt();await prompt.userChoice;}finally{clearPrompt();}
  };
  const enable=async()=>{
    if(!("Notification" in window))return;
    const result=await Notification.requestPermission();window.dispatchEvent(new Event("dontus-notification-permission"));
    setMessage(result==="granted"?"Notificações ativadas neste computador.":"Altere a permissão de notificações nas configurações deste site no navegador.");
  };
  return <>
    {!installed&&<button className="desktop-install-button" type="button" onClick={()=>void install()} title="Instalar Dontus no computador"><Download size={16}/><span>Instalar</span></button>}
    <button className="icon-button" type="button" aria-label="Instalação e notificações no computador" title="Instalação e notificações no computador" onClick={()=>setOpen(true)}><BellRing size={18}/></button>
    {open&&<div className="modal-backdrop desktop-install-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setOpen(false)}><section className="modal desktop-install-dialog" role="dialog" aria-modal="true" aria-label="Dontus no computador"><header className="modal-head"><div><span className="eyebrow">APLICATIVO DONTUS</span><h2>Dontus no computador</h2></div><button className="icon-button" onClick={()=>setOpen(false)} aria-label="Fechar instalação"><X size={19}/></button></header><div className="desktop-install-body"><p>{installed?"O Dontus já está aberto como aplicativo.":"Instale para abrir o Dontus em uma janela própria e fixar o ícone na barra de tarefas."}</p>{!installed&&(prompt?<button className="primary-button" onClick={()=>void install()}><Download size={16}/>Instalar no computador</button>:<p>No Chrome ou Edge, abra o menu do navegador e escolha a opção de instalar este site como aplicativo. A instalação precisa de uma conexão HTTPS ou localhost.</p>)}<h3>Notificações</h3><p>O ícone mostra a quantidade de notificações pendentes enquanto o aplicativo estiver aberto, inclusive minimizado. O contador é removido quando elas forem vistas.</p>{permission==="granted"?<p className="desktop-notification-success">Notificações ativadas neste computador.</p>:permission==="unsupported"?<p>Este navegador não oferece notificações do computador.</p>:<button className="secondary-button" onClick={()=>void enable()}><BellRing size={16}/>Ativar notificações no computador</button>}{message&&<p role="status">{message}</p>}</div><footer className="modal-actions"><button className="primary-button" onClick={()=>setOpen(false)}>Concluir</button></footer></section></div>}
  </>;
}
