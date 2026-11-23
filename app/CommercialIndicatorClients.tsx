"use client";

import PaginatedItems from "@/app/PaginatedItems";
import {useRef} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import useDialogFocus from './useDialogFocus';
import type {CommercialAnalyticsEntry} from '@/lib/commercial-analytics';
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
export default function CommercialIndicatorClients({title,period,entries,onClose}:{title:string;period:string;entries:CommercialAnalyticsEntry[];onClose:()=>void}){
 const dialog=useRef<HTMLElement>(null);useDialogFocus(dialog,onClose);
 const groups=[...new Set(entries.map(entry=>entry.funnel))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 return createPortal(<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section ref={dialog} className="modal commercial-indicator-clients" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><header className="modal-head"><div><h2>{title}</h2><p>{period} · {entries.length} cliente(s) · {money(entries.reduce((sum,entry)=>sum+entry.amount,0))}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar lista de clientes"><X size={20}/></button></header><div className="indicator-clients-scroll">{groups.map(crm=>{const rows=entries.filter(entry=>entry.funnel===crm);return <section key={crm}><h3>{crm}<small>{rows.length} cliente(s) · {money(rows.reduce((sum,entry)=>sum+entry.amount,0))}</small></h3><div className="analytical-table-scroll"><table><thead><tr><th>Cliente / ID</th><th>Responsável</th><th>Etapa</th><th>Data do ganho</th><th>Valor</th></tr></thead><tbody>{<PaginatedItems label="clientes" table>{rows.map(entry=><tr key={entry.item.id}><td>{entry.item.customer_name||entry.item.title}<small>{String(entry.detail.clientId||'')}</small></td><td>{entry.seller}</td><td>{entry.stage}</td><td>{entry.saleDate?entry.saleDate.split('-').reverse().join('/'):'—'}</td><td>{money(entry.amount)}</td></tr>)}</PaginatedItems>}</tbody></table></div></section>})}{!entries.length&&<p>Nenhum cliente neste indicador e período.</p>}</div></section></div>,document.querySelector('.app-shell')||document.body);
}
