"use client";
import { RotateCcw, Search } from "lucide-react";
import type { FormEvent } from "react";
import SearchableSelect from "./SearchableSelect";
import type {SupportAccessReason} from "./SupportAccessPanels";
import type {AccessFilters} from "@/lib/support-access-indicators";

export default function SupportAccessFilters({filters,onChange,onApply,onClear,responsible,reasons,busy}:{filters:AccessFilters;onChange:(value:AccessFilters)=>void;onApply:(event:FormEvent)=>void;onClear:()=>void;responsible:{email:string;name:string}[];reasons:SupportAccessReason[];busy:boolean}){
 return <form className="support-access-history-filters support-access-shared-filters" onSubmit={onApply}>
   <label>Data inicial<input aria-label="Data inicial" type="date" value={filters.from} onChange={event=>onChange({...filters,from:event.target.value})}/></label>
   <label>Data final<input aria-label="Data final" type="date" value={filters.to} min={filters.from||undefined} onChange={event=>onChange({...filters,to:event.target.value})}/></label>
   <label>Responsável<SearchableSelect label="Pesquisar responsável" value={filters.responsible} onChange={value=>onChange({...filters,responsible:value})} options={[{value:"",label:"Todos os responsáveis"},...responsible.map(person=>({value:person.email,label:person.name||person.email,description:person.email}))]}/></label>
   <label>Motivo<SearchableSelect label="Pesquisar motivo no histórico" value={filters.reasonId} onChange={value=>onChange({...filters,reasonId:value})} options={[{value:"",label:"Todos os motivos"},...reasons.map(reason=>({value:reason.id,label:reason.name,description:`${reason.departmentName}${reason.active?"":" · Inativo"}`}))]}/></label>
   <label>Identificação do cliente<input aria-label="Identificação do cliente" inputMode="numeric" pattern="[0-9]+" value={filters.identification} onChange={event=>onChange({...filters,identification:event.target.value})} placeholder="Todas as bases"/></label>
   <div className="support-filter-actions"><button type="submit" className="primary-button" disabled={busy}><Search size={16} aria-hidden="true"/>Filtrar</button><button type="button" className="secondary-button" disabled={busy} onClick={onClear} aria-label="Limpar filtros do histórico"><RotateCcw size={16} aria-hidden="true"/>Limpar</button></div>
 </form>;
}
