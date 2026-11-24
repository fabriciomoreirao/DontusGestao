'use client';
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { fetchRecordPage, recordKey, type RecordPage, type RecordPath } from '@/lib/record-pages';
import { useRecordPages } from '@/app/RecordPagesProvider';
import './pagination.css';

export function RecordPageSize({value,onChange,label='registros',disabled=false}:{value:number;onChange:(size:number)=>void;label?:string;disabled?:boolean}) {
  return <div className="record-page-size"><label>Exibir <select disabled={disabled} aria-label={`Quantidade de ${label} por página`} value={value} onChange={event=>onChange(Number(event.target.value))}>{[10,30,50,100].map(size=><option value={size} key={size}>{size}</option>)}</select> por página</label></div>;
}
export default function PaginatedItems({ children, label='registros', table=false, pageSize=DEFAULT_PAGE_SIZE, resetKey, mode='list', source: explicitSource, onRows }: {children:ReactNode;label?:string;table?:boolean;pageSize?:number;resetKey?:string;mode?:'list'|'cards';source?:RecordPath;onRows?:(rows:unknown[])=>void}) {
  const context=useRecordPages();const rows=Children.toArray(children);
  const keys=rows.map((row,index)=>recordKey(isValidElement(row)?row.key:index)||String(index));
  const identity=JSON.stringify([context?.scope,context?.filters,resetKey,keys]);
  const source=explicitSource??context?.resolve(keys);
  if(mode==='cards'||context?.disabled||!source)return <>{children}</>;
  return <SizedRecordList key={context?.scope} identity={identity} rows={rows} keys={keys} source={source} label={label} table={table} defaultSize={pageSize} onRows={onRows}/>;
}
function SizedRecordList({identity,defaultSize,...props}:{identity:string;defaultSize:number;rows:ReactNode[];keys:string[];source:RecordPath;label:string;table:boolean;onRows?:(rows:unknown[])=>void}) {
  const [size,setSize]=useState([10,30,50,100].includes(defaultSize)?defaultSize:10);
  return <RecordList key={`${identity}:${size}`} {...props} size={size} onSize={setSize}/>;
}
function RecordList({rows,keys,source,label,table,size,onSize,onRows}:{rows:ReactNode[];keys:string[];source:RecordPath;label:string;table:boolean;size:number;onSize:(value:number)=>void;onRows?:(rows:unknown[])=>void}) {
  const context=useRecordPages();const latest=useRef({context,onRows});latest.current={context,onRows};
  const [page,setPage]=useState(1);
  const [server,setServer]=useState<RecordPage|null>(null);const [loading,setLoading]=useState(Boolean(source));const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  const requestKey=JSON.stringify([source,keys,page,size,retry]);
  useEffect(()=>{
    if(!source)return;
    const controller=new AbortController();let current=true;setLoading(true);setError('');
    fetchRecordPage(source,keys,page,size,controller.signal).then(result=>{if(!current)return;if(latest.current.onRows)latest.current.onRows(result.rows);else latest.current.context?.onRows(source,result.rows);setServer(result)})
      .catch(reason=>{if(current&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Não foi possível carregar os registros.')}).finally(()=>{if(current)setLoading(false)});
    return()=>{current=false;controller.abort()};
    // Unrelated realtime updates do not repeat a request whose parameters are unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[requestKey]);
  const total=server?.total??0,currentPage=server?.page??page,pages=Math.max(1,Math.ceil(total/size));
  const byKey=new Map(keys.map((key,index)=>[key,rows[index]]));
  const visible=loading||error?[]:(server?.keys??[]).map(key=>byKey.get(recordKey(key)||key)).filter(Boolean);
  const row=(content:ReactNode,key:string)=>table?<tr key={key} className="record-pagination-row"><td ref={cell=>{if(!cell)return;const owner=cell.closest('table');const header=owner?.tHead?.rows[0]??owner?.rows[0];cell.colSpan=header?Array.from(header.cells).reduce((sum,column)=>sum+column.colSpan,0):1}}>{content}</td></tr>:content;
  return <>{row(<RecordPageSize value={size} label={label} onChange={onSize}/>,'size')}
    {loading?row(<p className="record-page-message" role="status">Carregando {label}…</p>,'loading'):error?row(<div className="record-page-message" role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div>,'error'):visible}
    {row(<nav className="record-pagination" data-pagination-source={source?'server':'report'} aria-label={`Páginas de ${label}`} aria-busy={loading}><span role="status" aria-live="polite">{loading?'Carregando…':`${total?(currentPage-1)*size+1:0}–${Math.min(currentPage*size,total)} de ${total} ${label}`}</span><div><button type="button" disabled={loading||currentPage<=1} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={15} aria-hidden="true"/>Anterior</button><span aria-label={`Página ${currentPage} de ${pages}`}>{currentPage}/{pages}</span><button type="button" disabled={loading||currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Seguinte<ChevronRight size={15} aria-hidden="true"/></button></div></nav>,'pages')}
  </>;
}
