"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type TextareaHTMLAttributes } from "react";
import { FileText, Paperclip, Send, Smile, X } from "lucide-react";
import { joinComment, readCommentFiles, splitComment, type CommentFile } from "@/lib/comment-files";
import {commentSubmitButton,submitComment} from "@/lib/comment-submit";
import CommentEditor from "@/app/CommentEditor";
import FormattedText from "@/app/FormattedText";

type Props=TextareaHTMLAttributes<HTMLTextAreaElement>&{"data-comment-input"?:boolean|"true"|"false"};

export default forwardRef<HTMLTextAreaElement,Props>(function CommentInput({value,defaultValue,name,onChange,disabled,readOnly,...props},ref){
  const input=useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref,()=>input.current!);
  const isComposer=props["data-comment-input"]===true||props["data-comment-input"]==="true";
  const [emojis,setEmojis]=useState(false);
  const [nativeDisabled,setNativeDisabled]=useState(false);
  const [submitLabel,setSubmitLabel]=useState("Enviar comentário");
  const [local,setLocal]=useState(String(defaultValue??""));
  const current = String(value??local);const latest=useRef(current);latest.current=current;
  const {text,files}=splitComment(current);const [error,setError]=useState("");const [reading,setReading]=useState(false);
  const emit=(next:string)=>{if(value===undefined)setLocal(next);onChange?.({target:{value:next},currentTarget:{value:next}} as ChangeEvent<HTMLTextAreaElement>)};
  useEffect(()=>{
    const form=input.current?.form;if(!reading||!form)return;
    const block=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation()};
    form.addEventListener("submit",block,true);
    return()=>form.removeEventListener("submit",block,true);
  },[reading]);
  const add=async(event:ChangeEvent<HTMLInputElement>)=>{
    const incoming=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";if(!incoming.length)return;
    const existing=splitComment(latest.current).files;
    if(existing.length+incoming.length>10||existing.reduce((sum,file)=>sum+file.size,0)+incoming.reduce((sum,file)=>sum+file.size,0)>15*1024*1024){setError("Use até 10 arquivos, totalizando no máximo 15 MB por comentário.");return}
    setReading(true);setError("");
    try{const added=await readCommentFiles(incoming);const state=splitComment(latest.current);emit(joinComment(state.text,[...state.files,...added]))}catch(error){setError(error instanceof Error?error.message:"Não foi possível anexar os arquivos.")}finally{setReading(false)}
  };
  useEffect(()=>{
    if(!isComposer||!input.current)return;
    const button=commentSubmitButton(input.current);if(!button)return;
    button.dataset.commentNativeSubmit="true";
    const update=()=>{setNativeDisabled(button.disabled);setSubmitLabel(button.getAttribute("aria-label")||button.textContent?.trim()||"Enviar comentário")};
    update();const observer=new MutationObserver(update);observer.observe(button,{attributes:true,attributeFilter:["disabled"]});
    return()=>{observer.disconnect();delete button.dataset.commentNativeSubmit};
  });
  const insertEmoji=(emoji:string)=>{
    const node=input.current;if(!node)return;
    const start=node.selectionStart,end=node.selectionEnd;
    emit(joinComment(`${text.slice(0,start)}${emoji}${text.slice(end)}`,files));setEmojis(false);
    requestAnimationFrame(()=>{node.focus();node.setSelectionRange(start+emoji.length,start+emoji.length)});
  };
  const editor=<CommentEditor {...props} required={props.required&&!files.length} ref={input} data-comment-has-files={files.length>0||undefined} value={text} disabled={disabled||reading} readOnly={readOnly} onChange={event=>emit(joinComment(event.target.value,files))}/>;
  const attachment=<label className="comment-paperclip" title="Anexar arquivos"><Paperclip size={18}/>{!isComposer&&<span>{reading?"Lendo arquivos…":"Anexar arquivo"}</span>}<input aria-label="Anexar arquivos ao comentário" type="file" multiple disabled={disabled||reading||readOnly} onChange={event=>void add(event)}/></label>;
  return <div className={`comment-input-field${isComposer?" is-chat-composer":""}`} data-comment-uploading={reading||undefined}>{name&&<input type="hidden" name={name} disabled={disabled} value={current}/>}{isComposer?<div className="comment-composer-bar"><button className="comment-emoji-button" type="button" aria-label="Adicionar emoji" disabled={disabled||reading||readOnly} onClick={()=>setEmojis(value=>!value)}><Smile size={18}/></button>{editor}{attachment}<button className="comment-send-button" type="button" aria-label={submitLabel} disabled={disabled||reading||readOnly||nativeDisabled||!text.trim()&&!files.length} onClick={()=>{if(input.current)submitComment(input.current)}}><Send size={18}/></button>{emojis&&<div className="comment-emoji-menu" aria-label="Emojis rápidos">{["😀","👍","✅","🎯","🚨","🙏","📌","💬","📎","🚀"].map(emoji=><button key={emoji} type="button" aria-label={`Inserir ${emoji}`} onClick={()=>insertEmoji(emoji)}>{emoji}</button>)}</div>}</div>:<>{editor}<div className="comment-file-tools">{attachment}<small>Imagens, vídeos, PDF, Excel e outros · até 5 MB por arquivo</small></div></>}{files.length>0&&<div className="comment-attachment-list">{files.map((file,index)=><span key={`${file.name}-${index}`}><FileText size={15}/>{file.name}<button type="button" disabled={disabled||reading||readOnly} aria-label={`Remover ${file.name}`} onClick={()=>emit(joinComment(text,files.filter((_,i)=>i!==index)))}><X size={14}/></button></span>)}</div>}{error&&<p className="form-error" role="alert">{error}</p>}</div>;
});

export function CommentContent({text}:{text?:string}){
  const content=splitComment(text||"");
  return <span className="comment-content">{content.text&&<span className="comment-text"><FormattedText text={content.text}/></span>}{content.files.length>0&&<span className="comment-attachment-list">{content.files.map((file,index)=><button className="comment-file-link" key={`${file.name}-${index}`} type="button" onClick={()=>openFile(file)}><FileText size={16}/><span>{file.name}<small>{Math.max(1,Math.round(file.size/1024))} KB</small></span></button>)}</span>}</span>;
}
export function openFile(file:CommentFile){
  const raw=atob(file.dataUrl.slice(file.dataUrl.indexOf(",")+1));const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));
  const preview=/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|ogg)|audio\/(mpeg|wav|ogg)|application\/pdf)$/.test(file.type);
  const url=URL.createObjectURL(new Blob([bytes],{type:preview?file.type:"application/octet-stream"}));
  if(preview)window.open(url,"_blank","noopener,noreferrer");else{const link=document.createElement("a");link.href=url;link.download=file.name;link.click()}
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
