'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { recordSources, resolveRecordSource, type RecordPath } from '@/lib/record-pages';
type Context = { scope: string; filters: string; disabled: boolean; resolve: (keys: string[]) => RecordPath | undefined; onRows: (path: RecordPath, rows: unknown[]) => void };
const RecordPagesContext = createContext<Context | null>(null);
export const useRecordPages = () => useContext(RecordPagesContext);
export default function RecordPagesProvider({ data, scope, module, onRows, onEnter, children }: { data: unknown; scope: string; module: string; onRows: Context['onRows']; onEnter?:()=>void; children: ReactNode }) {
  const index = useMemo(() => recordSources(data), [data]);
  const [filters,setFilters]=useState('');
  const enteredScope=useRef(scope);const enter=useRef(onEnter);enter.current=onEnter;
  useEffect(()=>{if(enteredScope.current===scope)return;enteredScope.current=scope;enter.current?.();},[scope]);
  useEffect(()=>{
    const update=(event:Event)=>{
      const input=event.target;if(!(input instanceof HTMLInputElement||input instanceof HTMLSelectElement))return;
      if(input.closest('.people-picker-menu,.people-picker-dropdown,.people-picker-options'))return;
      const area=input.closest('.reminder-filter-toolbar,.toolbar,.commercial-lead-filters,.task-filter-controls');if(!area)return;
      setFilters(JSON.stringify(Array.from(area.querySelectorAll('input,select')).map(field=>({value:(field as HTMLInputElement).value,checked:(field as HTMLInputElement).checked}))));
    };
    document.addEventListener('input',update);document.addEventListener('change',update);
    return()=>{document.removeEventListener('input',update);document.removeEventListener('change',update)};
  },[scope]);
  return <RecordPagesContext.Provider value={{ scope, filters, disabled:module==='hr', resolve: keys => resolveRecordSource(index, keys, module), onRows }}>{children}</RecordPagesContext.Provider>;
}
