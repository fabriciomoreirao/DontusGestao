"use client";
import { Bold } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState, type ChangeEvent, type TextareaHTMLAttributes } from "react";
import { toggleCommentBold } from "@/lib/comment-formatting";

export default forwardRef<HTMLTextAreaElement,TextareaHTMLAttributes<HTMLTextAreaElement>>(function CommentEditor({value,defaultValue,onChange,onKeyDown,disabled,readOnly,...props},forwardedRef){
  const input=useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef,()=>input.current!);
  const [local,setLocal]=useState(String(defaultValue??""));
  const current=String(value??local);
  const bold=()=>{
    const node=input.current;if(!node||disabled||readOnly)return;
    const next=toggleCommentBold(node.value,node.selectionStart,node.selectionEnd);
    if(value===undefined)setLocal(next.text);
    onChange?.({target:{value:next.text},currentTarget:{value:next.text}} as ChangeEvent<HTMLTextAreaElement>);
    requestAnimationFrame(()=>{node.focus();node.setSelectionRange(next.start,next.end)});
  };
  return <span className="comment-editor"><textarea {...props} ref={input} value={current} disabled={disabled} readOnly={readOnly} onChange={event=>{if(value===undefined)setLocal(event.target.value);onChange?.(event)}} onKeyDown={event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="b"){event.preventDefault();event.stopPropagation();bold();return}onKeyDown?.(event);
  }}/><button type="button" className="comment-bold-button" title="Negrito (Ctrl+B)" aria-label="Negrito no texto selecionado" disabled={disabled||readOnly} onMouseDown={event=>event.preventDefault()} onClick={bold}><Bold size={16} aria-hidden="true"/></button></span>;
});
