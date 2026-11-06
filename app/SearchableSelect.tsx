"use client";
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filterSelectChoices, moveChoice, type SelectChoice } from "@/lib/searchable-select";

type Props={id?:string;label:string;value:string;onChange:(value:string)=>void;options:SelectChoice[];placeholder?:string;disabled?:boolean;required?:boolean;name?:string};
export default function SearchableSelect({id,label,value,onChange,options,placeholder="Digite para pesquisar…",disabled,required,name}:Props){
  const unique=useId();const listId=`${unique}-options`;const input=useRef<HTMLInputElement>(null);const popup=useRef<HTMLDivElement>(null);const wrapper=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);const [query,setQuery]=useState("");const [active,setActive]=useState(0);const [position,setPosition]=useState({top:0,left:0,width:0,maxHeight:280});
  const visible=filterSelectChoices(options,query);const chosen=options.find(option=>option.value===value);
  useEffect(()=>{
    if(!open)return;
    const place=()=>{const rect=input.current?.getBoundingClientRect();if(!rect)return;const below=window.innerHeight-rect.bottom-12;const above=rect.top-12;const down=below>=Math.min(260,above);const maxHeight=Math.max(80,Math.min(320,down?below:above));const width=Math.min(rect.width,window.innerWidth-24);setPosition({top:down?rect.bottom+6:Math.max(8,rect.top-maxHeight-6),left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),width,maxHeight})};
    const outside=(event:PointerEvent)=>{if(!wrapper.current?.contains(event.target as Node)&&!popup.current?.contains(event.target as Node))setOpen(false)};
    const frame=requestAnimationFrame(place);document.addEventListener("pointerdown",outside);window.addEventListener("scroll",place,true);window.addEventListener("resize",place);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener("pointerdown",outside);window.removeEventListener("scroll",place,true);window.removeEventListener("resize",place)};
  },[open]);
  useEffect(()=>{if(open&&active>=0)document.getElementById(`${listId}-${active}`)?.scrollIntoView({block:"nearest"})},[active,open,listId,query]);
  const choose=(option:SelectChoice)=>{if(disabled||option.disabled)return;onChange(option.value);setOpen(false);setQuery("")};
  const show=()=>{if(disabled)return;setQuery("");setActive(Math.max(0,options.findIndex(option=>option.value===value&&!option.disabled)));setOpen(true)};
  const host=typeof document==="undefined"?null:document.querySelector(".app-shell")??document.body;
  return <div className="searchable-select" ref={wrapper}>{name&&<input type="hidden" name={name} value={value}/>}<Search className="searchable-select-icon" size={17} aria-hidden="true"/><input id={id} ref={input} role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open&&visible[active]?`${listId}-${active}`:undefined} aria-required={required||undefined} disabled={disabled} autoComplete="off" value={open?query:chosen?.label||""} placeholder={placeholder} onFocus={show} onClick={()=>{if(!open)show()}} onChange={event=>{setQuery(event.target.value);setActive(0);setOpen(true)}} onBlur={event=>{if(!popup.current?.contains(event.relatedTarget as Node))setOpen(false)}} onKeyDownCapture={event=>{if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();setOpen(false)}}} onKeyDown={event=>{
    if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();setOpen(false)}
    else if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();if(!open){show();return}setActive(moveChoice(visible,active,event.key==="ArrowDown"?1:-1))}
    else if(event.key==="Home"&&open){event.preventDefault();setActive(moveChoice(visible,-1,1))}
    else if(event.key==="End"&&open){event.preventDefault();setActive(moveChoice(visible,0,-1))}
    else if(event.key==="Enter"&&open){event.preventDefault();event.stopPropagation();if(visible[active])choose(visible[active])}
  }}/><ChevronDown className="searchable-select-arrow" size={17} aria-hidden="true"/>{open&&host&&createPortal(<div id={listId} ref={popup} className="searchable-select-options" role="listbox" aria-label={label} style={position}>{visible.map((option,index)=><button key={option.value} id={`${listId}-${index}`} type="button" role="option" aria-selected={option.value===value} aria-disabled={option.disabled||undefined} tabIndex={-1} disabled={option.disabled} className={index===active?"active":""} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(option)}><span><strong>{option.label}</strong>{option.description&&<small>{option.description}</small>}</span>{option.value===value&&<Check size={17} aria-hidden="true"/>}</button>)}{!visible.length&&<p role="status">Nenhum resultado para “{query}”.</p>}</div>,host)}</div>;
}
