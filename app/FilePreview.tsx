"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, X } from "lucide-react";

export default function FilePreview({url, name, onRemove, disabled = false}: {url: string; name: string; onRemove?: () => void; disabled?: boolean}) {
  const [open, setOpen] = useState(false);
  const extension = name.split(".").pop()?.toLowerCase();
  const image = /^(png|jpe?g|gif|webp|avif)$/.test(extension || "") || url.startsWith("data:image/");
  const video = /^(mp4|webm|ogg|mov)$/.test(extension || "") || url.startsWith("data:video/");
  const audio = /^(mp3|wav|m4a|oga|opus)$/.test(extension || "") || url.startsWith("data:audio/");
  const pdf = extension === "pdf" || url.startsWith("data:application/pdf");
  const preview = image || video || audio || pdf;
  if (!url) return <span>{name} · Arquivo indisponível</span>;
  return <span className="file-preview-field"><a href={url} target="_blank" rel="noreferrer" onClick={event => { if (preview) {event.preventDefault(); setOpen(true);} }}><FileText size={16}/>{name}</a>{onRemove && <button type="button" disabled={disabled} onClick={onRemove} aria-label={`Excluir ${name}`}><X size={16}/></button>}{open && createPortal(<div className="file-preview-backdrop" role="presentation" onMouseDown={event => {if(event.target === event.currentTarget) setOpen(false);}}><section className="file-preview-dialog" role="dialog" aria-modal="true" aria-label={name}><header><strong>{name}</strong><a href={url} download={name}><Download size={18}/> Baixar</a><button type="button" autoFocus aria-label="Fechar visualização" onClick={() => setOpen(false)}><X size={20}/></button></header><div>{image ? <img src={url} alt={name}/> : video ? <video src={url} controls autoPlay={false}/> : audio ? <audio src={url} controls/> : <iframe src={url} title={name}/>}</div></section></div>, document.body)}</span>;
}
