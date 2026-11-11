"use client";
import { forwardRef, type InputHTMLAttributes, type MouseEvent } from "react";
import { desktopWhatsappUrl } from "@/lib/whatsapp";

function WhatsAppIcon(){return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.7a8.5 8.5 0 1 1 16.2-4.1Z"/><path d="M8.4 7.6c-.7.4-.9 1.5-.3 2.9 1 2.3 2.8 4.1 5.2 5.1 1.3.5 2.4.3 2.9-.5l.5-1.2-2.5-1.2-1 1c-1.5-.7-2.7-1.9-3.4-3.4l.9-.9-1.2-2.2Z"/></svg>}
export default function PhoneLink({phone,iconOnly=false}:{phone?:string|null;iconOnly?:boolean}){
  const value=phone||"";const url=desktopWhatsappUrl(value);
  if(!url)return iconOnly?null:<span>{value||"Não informado"}</span>;
  const open=(event:MouseEvent)=>{event.preventDefault();event.stopPropagation();window.location.href=url};
  return <span role="link" tabIndex={0} className={`phone-link ${iconOnly?"icon-only":""}`} title={`Abrir ${value} no WhatsApp do computador`} aria-label={`Abrir WhatsApp do computador para ${value}`} onClick={open} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();window.location.href=url}}}><WhatsAppIcon/>{!iconOnly&&<span>{value}</span>}</span>;
}
export const PhoneInput=forwardRef<HTMLInputElement,InputHTMLAttributes<HTMLInputElement>>(function PhoneInput(props,ref){
  return <input type="tel" {...props} ref={ref}/>;
});
