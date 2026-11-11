"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, FileText, X } from "lucide-react";

type Props = {url: string; name: string; size?: number; onRemove?: () => void; disabled?: boolean};

export default function FilePreview({url, name, size, onRemove, disabled = false}: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const extension = name.split(".").pop()?.toLowerCase() || "";
  const dataType = url.startsWith("data:") ? url.slice(5, url.indexOf(";")) : null;
  const image = dataType !== null ? /^image\/(png|jpeg|gif|webp|avif)$/.test(dataType) : /^(png|jpe?g|gif|webp|avif)$/.test(extension);
  const video = dataType !== null ? /^video\/(mp4|webm|ogg|quicktime)$/.test(dataType) : /^(mp4|webm|ogg|mov|m4v)$/.test(extension);
  const audio = dataType !== null ? /^audio\//.test(dataType) : /^(mp3|wav|m4a|oga|ogg|opus|webm)$/.test(extension);
  const pdf = dataType !== null ? dataType === "application/pdf" : extension === "pdf";
  const close = () => {setOpen(false); requestAnimationFrame(() => trigger.current?.focus());};
  if (!url) return <span>{name} · Arquivo indisponível</span>;
  return <span className="file-preview-field">
    <button ref={trigger} type="button" className="file-preview-open" onClick={() => setOpen(true)} aria-label={`Visualizar ${name}`}><FileText size={18}/><span>{name}{size !== undefined && <small>{Math.max(1,Math.round(size/1024))} KB</small>}</span><Eye size={17}/></button>
    {onRemove && <button type="button" className="file-preview-remove" disabled={disabled} onClick={onRemove} aria-label={`Remover ${name}`}><X size={16}/></button>}
    {open && createPortal(<div className="file-preview-backdrop" role="presentation" onMouseDown={event => {if(event.target === event.currentTarget)close();}}><section className="file-preview-dialog" role="dialog" aria-modal="true" aria-label={`Visualizar ${name}`} onKeyDown={event => {
      if(event.key === "Escape"){event.preventDefault();event.stopPropagation();close();}
      if(event.key === "Tab"){
        const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],video[controls],audio[controls],iframe')];
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}><header><strong>{name}</strong><a href={url} download={name}><Download size={18}/> Baixar</a><button type="button" autoFocus aria-label="Fechar visualização" onClick={close}><X size={20}/></button></header><div>{image ? <img src={url} alt={name}/> : video ? <video src={url} controls/> : audio ? <audio src={url} controls/> : pdf ? <iframe src={url} title={name}/> : <div className="file-preview-download"><FileText size={48}/><strong>{name}</strong><p>Baixe o arquivo para abrir no aplicativo correspondente.</p><a href={url} download={name}><Download size={18}/> Baixar arquivo</a></div>}</div></section></div>, document.body)}
  </span>;
}

export function LocalFilePreview({file, onRemove, disabled}: {file: File; onRemove?: () => void; disabled?: boolean}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{
    const preview=/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|wav|ogg|webm|mp4)|application\/pdf)$/.test(file.type);
    const next=URL.createObjectURL(preview?file:new Blob([file],{type:"application/octet-stream"}));
    setUrl(next);return()=>URL.revokeObjectURL(next);
  },[file]);
  return <FilePreview url={url} name={file.name} size={file.size} onRemove={onRemove} disabled={disabled}/>;
}
