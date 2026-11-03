"use client";

import { Check, ChevronDown } from "lucide-react";
import { Children, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";

type Choice = { value:string; label:string; disabled:boolean };
const text = (node:ReactNode):string => Children.toArray(node).map(child => isValidElement<{ children?:ReactNode }>(child) ? text(child.props.children) : String(child ?? "")).join("");
const normalize = (value:string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const values = (value:SelectHTMLAttributes<HTMLSelectElement>["value"]) => value == null ? [] : Array.isArray(value) ? value.map(String) : [String(value)];
const PeopleDirectory = createContext<Array<{id:string;name:string}>>([]);
export function PeopleDirectoryProvider({people,children}:{people:Array<{id:string;name:string}>;children:ReactNode}) {
  return <PeopleDirectory.Provider value={people}>{children}</PeopleDirectory.Provider>;
}

export default function SearchablePeopleSelect({ searchLabel = "Responsável", children, ...props }:SelectHTMLAttributes<HTMLSelectElement> & { searchLabel?:string }) {
  const directory = useContext(PeopleDirectory);
  if (children === undefined) children = [<option key="empty" value="">Selecionar responsável...</option>,...directory.map(person=><option value={person.name} key={person.id}>{person.name}</option>)];
  const choices:Choice[] = [];
  const collect = (nodes:ReactNode) => Children.forEach(nodes, child => {
    if (!isValidElement<{value?:string | number; disabled?:boolean; children?:ReactNode}>(child)) return;
    if (child.type === "option") choices.push({value:String(child.props.value ?? text(child.props.children)),label:text(child.props.children),disabled:Boolean(child.props.disabled)});
    else collect(child.props.children);
  });
  collect(children);
  for (const value of values(props.value ?? props.defaultValue)) {
    if (!value || choices.some(choice => choice.value === value)) continue;
    const label = /^[0-9a-f-]{36}$/i.test(value) ? "Responsável atual indisponível" : `${value} (atual)`;
    choices.push({value,label,disabled:false});
    children = [children,<option key={`current-${value}`} value={value}>{label}</option>];
  }
  const native = useRef<HTMLSelectElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const wrapper = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [selected,setSelected] = useState(() => values(props.defaultValue ?? props.value ?? (props.multiple ? [] : choices[0]?.value)));
  const [open,setOpen] = useState(false);
  const [query,setQuery] = useState("");
  const [active,setActive] = useState(0);
  const [invalid,setInvalid] = useState(false);
  const [position,setPosition] = useState({top:0,left:0,width:0,maxHeight:240});
  const current = props.value === undefined ? selected : values(props.value);
  const visible = choices.filter(choice => normalize(choice.label).includes(normalize(query)));
  const selectedLabels = choices.filter(choice => current.includes(choice.value)).map(choice=>choice.label);
  const label = props.multiple && selectedLabels.length > 2 ? `${selectedLabels.length} selecionados` : selectedLabels.join(", ");
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect(); if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = Math.max(80,rect.top - 12);
      const openBelow = below >= Math.min(220,above);
      const height = Math.min(260,Math.max(80,openBelow?below:above));
      const width = Math.min(rect.width,window.innerWidth-16);
      setPosition({top:openBelow?rect.bottom+4:Math.max(8,rect.top-height-4),left:Math.max(8,Math.min(rect.left,window.innerWidth-width-8)),width,maxHeight:height});
    };
    const outside = (event:PointerEvent) => { if (!wrapper.current?.contains(event.target as Node) && !list.current?.contains(event.target as Node)) setOpen(false); };
    const frame=window.requestAnimationFrame(place);document.addEventListener("pointerdown",outside);window.addEventListener("resize",place);window.addEventListener("scroll",place,true);
    return () => {window.cancelAnimationFrame(frame);document.removeEventListener("pointerdown",outside);window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true);};
  },[open]);
  const choose = (choice:Choice) => {
    const select = native.current;if(!select||choice.disabled||props.disabled)return;
    const next = props.multiple ? (current.includes(choice.value)?current.filter(value=>value!==choice.value):[...current,choice.value]) : [choice.value];
    if(props.multiple)for(const option of select.options)option.selected=next.includes(option.value);
    else select.value=choice.value;
    setSelected(next);setInvalid(false);setQuery("");
    select.dispatchEvent(new Event("change",{bubbles:true}));
    if(!props.multiple)setOpen(false);
    input.current?.focus({preventScroll:true});
  };
  const host = typeof document === "undefined" ? null : document.querySelector(".app-shell") ?? document.body;
  return <span ref={wrapper} className={`people-picker ${props.className ?? ""}`}>
    <select {...props} defaultValue={undefined} value={props.value ?? (props.multiple ? selected : selected[0] ?? "")} onChange={event=>{setSelected([...event.currentTarget.selectedOptions].map(option=>option.value));props.onChange?.(event);}} id={props.id ? `${props.id}-native` : undefined} ref={native} className="people-picker-native" tabIndex={-1} aria-hidden="true" onFocus={event=>{props.onFocus?.(event);input.current?.focus();}} onInvalid={event=>{event.preventDefault();setInvalid(true);input.current?.focus();props.onInvalid?.(event);}}>{children}</select>
    <input ref={input} id={props.id} role="combobox" aria-label={props["aria-label"] ?? searchLabel} aria-controls={listId} aria-expanded={open} aria-autocomplete="list" aria-activedescendant={open&&visible[active]?`${listId}-${active}`:undefined} aria-invalid={invalid||undefined} aria-required={props.required||undefined} aria-describedby={props["aria-describedby"]} autoComplete="off" disabled={props.disabled} value={open?query:label} placeholder="Digite o nome para buscar..." onFocus={()=>{setOpen(true);setQuery("");setActive(Math.max(0,choices.findIndex(choice=>current.includes(choice.value))));}} onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(0);}} onBlur={event=>{if(!list.current?.contains(event.relatedTarget as Node))setOpen(false);}} onKeyDownCapture={event=>{if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();setOpen(false);}}} onKeyDown={event=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setOpen(false);}
      if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setOpen(true);setActive(value=>Math.max(0,Math.min(visible.length-1,value+(event.key==="ArrowDown"?1:-1))));}
      if(event.key==="Enter"&&open){event.preventDefault();if(visible[active])choose(visible[active]);}
    }}/><ChevronDown className="people-picker-chevron" size={15}/>
    {invalid&&<small className="people-picker-error">Selecione uma pessoa da lista.</small>}
    {open&&host&&createPortal(<div ref={list} id={listId} role="listbox" aria-label={searchLabel} aria-multiselectable={props.multiple||undefined} className="people-picker-options" style={position}>{visible.map((choice,index)=><button id={`${listId}-${index}`} type="button" role="option" aria-selected={current.includes(choice.value)} disabled={props.disabled||choice.disabled} className={index===active?"active":""} key={`${choice.value}-${index}`} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(choice)}><span>{choice.label}</span>{current.includes(choice.value)&&<Check size={15}/>}</button>)}{!visible.length&&<p>Nenhuma pessoa encontrada.</p>}</div>,host)}
  </span>;
}
