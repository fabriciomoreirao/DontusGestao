"use client";

import { forwardRef, useRef, useState, type ChangeEvent, type TextareaHTMLAttributes } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { joinComment, readCommentFiles, splitComment, type CommentFile } from "@/lib/comment-files";
import CommentEditor from "@/app/CommentEditor";
import FormattedText from "@/app/FormattedText";

export default forwardRef<HTMLTextAreaElement,TextareaHTMLAttributes<HTMLTextAreaElement>>(function CommentInput({value,defaultValue,name,onChange,disabled,...props},ref){
  const [local,setLocal]=useState(String(defaultValue??""));
  const current = String(value??local);const latest=useRef(current);latest.current=current;
  const {text,files}=splitComment(current);const [error,setError]=useState("");const [reading,setReading]=useState(false);
  const emit=(next:string)=>{if(value===undefined)setLocal(next);onChange?.({target:{value:next},currentTarget:{value:next}} as ChangeEvent<HTMLTextAreaElement>)};
  const add=async(event:ChangeEvent<HTMLInputElement>)=>{
    const incoming=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";if(!incoming.length)return;
    const existing=splitComment(latest.current).files;
    if(existing.length+incoming.length>10||existing.reduce((sum,file)=>sum+file.size,0)+incoming.reduce((sum,file)=>sum+file.size,0)>15*1024*1024){setError("Use até 10 arquivos, totalizando no máximo 15 MB por comentário.");return}
    setReading(true);setError("");
    try{const added=await readCommentFiles(incoming);const state=splitComment(latest.current);emit(joinComment(state.text,[...state.files,...added]))}catch(error){setError(error instanceof Error?error.message:"Não foi possível anexar os arquivos.")}finally{setReading(false)}
  };
  return <div className="comment-input-field" data-comment-uploading={reading||undefined}>{name&&<input type="hidden" name={name} disabled={disabled} value={current}/>}<CommentEditor {...props} ref={ref} data-comment-has-files={files.length>0||undefined} value={text} disabled={disabled||reading} onChange={event=>emit(joinComment(event.target.value,files))}/><div className="comment-file-tools"><label className="comment-paperclip" title="Anexar qualquer tipo de arquivo"><Paperclip size={18}/><span>{reading?"Lendo arquivos…":"Anexar arquivo"}</span><input aria-label="Anexar arquivos ao comentário" type="file" multiple disabled={disabled||reading} onChange={event=>void add(event)}/></label><small>Imagens, vídeos, PDF, Excel e outros · até 5 MB por arquivo</small></div>{files.length>0&&<div className="comment-attachment-list">{files.map((file,index)=><span key={`${file.name}-${index}`}><FileText size={15}/>{file.name}<button type="button" disabled={disabled||reading} aria-label={`Remover ${file.name}`} onClick={()=>emit(joinComment(text,files.filter((_,i)=>i!==index)))}><X size={14}/></button></span>)}</div>}{error&&<p className="form-error" role="alert">{error}</p>}</div>;
});

export function CommentContent({text}:{text?:string}){
  const content=splitComment(text||"");
  return <span className="comment-content"><span className="comment-text"><FormattedText text={content.text}/></span>{content.files.length>0&&<span className="comment-attachment-list">{content.files.map((file,index)=><button className="comment-file-link" key={`${file.name}-${index}`} type="button" onClick={()=>openFile(file)}><FileText size={16}/><span>{file.name}<small>{Math.max(1,Math.round(file.size/1024))} KB</small></span></button>)}</span>}</span>;
}
export function openFile(file:CommentFile){
  const raw=atob(file.dataUrl.slice(file.dataUrl.indexOf(",")+1));const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));
  const preview=/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|ogg)|audio\/(mpeg|wav|ogg)|application\/pdf)$/.test(file.type);
  const url=URL.createObjectURL(new Blob([bytes],{type:preview?file.type:"application/octet-stream"}));
  if(preview)window.open(url,"_blank","noopener,noreferrer");else{const link=document.createElement("a");link.href=url;link.download=file.name;link.click()}
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
