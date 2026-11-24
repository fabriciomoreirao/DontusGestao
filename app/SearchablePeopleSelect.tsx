"use client";

import { Check, ChevronDown } from "lucide-react";
import { Children, createContext, forwardRef, isValidElement, memo, useCallback, useContext, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";

type Choice = { value:string; label:string; disabled:boolean };
const text = (node:ReactNode):string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<{ children?:ReactNode }>(node)) return text(node.props.children);
  return Children.toArray(node).map(child => isValidElement<{ children?:ReactNode }>(child) ? text(child.props.children) : String(child ?? "")).join("");
};
const normalize = (value:string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const values = (value:SelectHTMLAttributes<HTMLSelectElement>["value"]) => value == null ? [] : Array.isArray(value) ? value.map(String) : [String(value)];
const PeopleDirectory = createContext<Array<{id:string;name:string}>>([]);
export function PeopleDirectoryProvider({people,children}:{people:Array<{id:string;name:string}>;children:ReactNode}) {
  return <PeopleDirectory.Provider value={people}>{children}</PeopleDirectory.Provider>;
}

const NativePeopleSelect = memo(forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function NativePeopleSelect(props, ref) {
  return <select {...props} ref={ref}/>;
}));

const PeopleOptions = memo(function PeopleOptions({ visible, current, active, disabled, listId, choose }: {
  visible: Choice[]; current: string[]; active: number; disabled?: boolean; listId: string; choose: (choice: Choice) => void;
}) {
  return <>{visible.map((choice,index)=><button id={`${listId}-${index}`} type="button" role="option" aria-selected={current.includes(choice.value)} disabled={disabled||choice.disabled} className={index===active?"active":""} key={`${choice.value}-${index}`} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(choice)}><span>{choice.label}</span>{current.includes(choice.value)&&<Check size={15}/>}</button>)}{!visible.length&&<p>Nenhuma pessoa encontrada.</p>}</>;
});

export default function SearchablePeopleSelect({ searchLabel = "Responsável", children, ...props }:SelectHTMLAttributes<HTMLSelectElement> & { searchLabel?:string }) {
  const directory = useContext(PeopleDirectory);
  const { onChange, onFocus, onInvalid, multiple, disabled } = props;
  const options = useMemo(() => {
    let optionNodes = children === undefined ? [<option key="empty" value="">Selecionar responsável...</option>,...directory.map(person=><option value={person.name} key={person.id}>{person.name}</option>)] : children;
    const choices:Choice[] = [];
    const collect = (nodes:ReactNode) => Children.forEach(nodes, child => {
      if (!isValidElement<{value?:string | number; disabled?:boolean; children?:ReactNode}>(child)) return;
      if (child.type === "option") {
        const label = text(child.props.children);
        choices.push({value:String(child.props.value ?? label),label,disabled:Boolean(child.props.disabled)});
      } else collect(child.props.children);
    });
    collect(optionNodes);
    for (const value of values(props.value ?? props.defaultValue)) {
      if (!value || choices.some(choice => choice.value === value)) continue;
      const label = /^[0-9a-f-]{36}$/i.test(value) ? "Responsável atual indisponível" : `${value} (atual)`;
      choices.push({value,label,disabled:false});
      optionNodes = [optionNodes,<option key={`current-${value}`} value={value}>{label}</option>];
    }
    return { choices, children: optionNodes };
  }, [children, directory, props.value, props.defaultValue]);
  const choices = options.choices;
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
  const current = useMemo(() => props.value === undefined ? selected : values(props.value), [props.value, selected]);
  const deferredQuery = useDeferredValue(query);
  const visible = useMemo(() => { const needle = normalize(deferredQuery); return choices.filter(choice => normalize(choice.label).includes(needle)); }, [choices, deferredQuery]);
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
  const choose = useCallback((choice:Choice) => {
    const select = native.current;if(!select||choice.disabled||disabled)return;
    const next = multiple ? (current.includes(choice.value)?current.filter(value=>value!==choice.value):[...current,choice.value]) : [choice.value];
    if(multiple)for(const option of select.options)option.selected=next.includes(option.value);
    else select.value=choice.value;
    setSelected(next);setInvalid(false);setQuery("");
    select.dispatchEvent(new Event("change",{bubbles:true}));
    if(!multiple)setOpen(false);
    input.current?.focus({preventScroll:true});
  }, [current, multiple, disabled]);
  const nativeChange = useCallback<NonNullable<SelectHTMLAttributes<HTMLSelectElement>["onChange"]>>(event => {
    setSelected([...event.currentTarget.selectedOptions].map(option=>option.value)); onChange?.(event);
  }, [onChange]);
  const nativeFocus = useCallback<NonNullable<SelectHTMLAttributes<HTMLSelectElement>["onFocus"]>>(event => {
    onFocus?.(event); input.current?.focus();
  }, [onFocus]);
  const nativeInvalid = useCallback<NonNullable<SelectHTMLAttributes<HTMLSelectElement>["onInvalid"]>>(event => {
    event.preventDefault(); setInvalid(true); input.current?.focus(); onInvalid?.(event);
  }, [onInvalid]);
  const host = typeof document === "undefined" ? null : document.querySelector(".app-shell") ?? document.body;
  return <span ref={wrapper} className={`people-picker ${props.className ?? ""}`}>
    <NativePeopleSelect {...props} defaultValue={undefined} value={props.value ?? (props.multiple ? selected : selected[0] ?? "")} onChange={nativeChange} id={props.id ? `${props.id}-native` : undefined} ref={native} className="people-picker-native" tabIndex={-1} aria-hidden="true" onFocus={nativeFocus} onInvalid={nativeInvalid}>{options.children}</NativePeopleSelect>
    <input ref={input} id={props.id} role="combobox" aria-label={props["aria-label"] ?? searchLabel} aria-controls={listId} aria-expanded={open} aria-autocomplete="list" aria-activedescendant={open&&visible[active]?`${listId}-${active}`:undefined} aria-invalid={invalid||undefined} aria-required={props.required||undefined} aria-describedby={props["aria-describedby"]} autoComplete="off" disabled={props.disabled} value={open?query:label} placeholder="Digite o nome para buscar..." onFocus={()=>{setOpen(true);setQuery("");setActive(Math.max(0,choices.findIndex(choice=>current.includes(choice.value))));}} onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(0);}} onBlur={event=>{if(!list.current?.contains(event.relatedTarget as Node))setOpen(false);}} onKeyDownCapture={event=>{if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();setOpen(false);}}} onKeyDown={event=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setOpen(false);}
      if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setOpen(true);setActive(value=>Math.max(0,Math.min(visible.length-1,value+(event.key==="ArrowDown"?1:-1))));}
      if(event.key==="Enter"&&open){event.preventDefault();const latest = query === deferredQuery ? visible : choices.filter(choice=>normalize(choice.label).includes(normalize(query))); if(latest[active])choose(latest[active]);}
    }}/><ChevronDown className="people-picker-chevron" size={15}/>
    {invalid&&<small className="people-picker-error">Selecione uma pessoa da lista.</small>}
    {open&&host&&createPortal(<div ref={list} id={listId} role="listbox" aria-label={searchLabel} aria-multiselectable={props.multiple||undefined} className="people-picker-options" style={position}><PeopleOptions visible={visible} current={current} active={active} disabled={props.disabled} listId={listId} choose={choose}/></div>,host)}
  </span>;
}
