"use client";

import { Save, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { calculateCommission, type CommissionRule } from "@/lib/commission-rules";

type ValueRow = { customerName:string; employeeName:string; saleValueCents:number; score:number|null; appliedRule?:CommissionRule; manual?:boolean; proposedCents:number; recordDetail?:{decision:string} };
const money=(cents:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);

export default function CommissionValueModal({row,busy,onClose,onSave}:{row:ValueRow;busy:boolean;onClose:()=>void;onSave:(cents:number)=>Promise<boolean>}) {
  const [value,setValue]=useState((row.saleValueCents/100).toFixed(2));
  const [saving,setSaving]=useState(false);const submitting=useRef(false);
  const cents=value.trim()?Math.round(Number(value)*100):NaN;
  const valid=Number.isSafeInteger(cents)&&cents>=0&&cents<=100000000000;
  const calculation=valid&&row.appliedRule?calculateCommission(row.appliedRule,cents,row.score):null;
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!valid||busy||submitting.current)return;submitting.current=true;setSaving(true);try{await onSave(cents)}finally{submitting.current=false;setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!saving&&onClose()}><section className="modal commission-decision-modal commission-value-modal" role="dialog" aria-modal="true" aria-label="Editar valor do cliente">
    <header className="modal-head"><div><span className="eyebrow">BASE DA COMISSÃO</span><h2>Editar valor do cliente</h2><p>{row.customerName} · {row.employeeName}</p></div><button className="icon-button" disabled={saving} onClick={onClose} aria-label="Fechar edição de valor"><X/></button></header>
    <form onSubmit={submit}><label>Valor final do cliente (R$)<input autoFocus type="number" min="0" max="1000000000" step="0.01" required value={value} disabled={busy||saving} onChange={event=>setValue(event.target.value)}/></label>
      <div className="commission-decision-preview"><span><small>Comissão prevista</small><strong>{row.manual?money(row.proposedCents):calculation?money(calculation.cents):"Aguardando regra"}</strong></span></div>
      <p>{row.manual?"A comissão manual mantém o valor já informado.":calculation?.label||"O valor ficará salvo para cálculo após configurar a regra."}</p>
      {row.recordDetail&&row.recordDetail.decision!=="pending"&&<p>Ao alterar o valor, o lançamento volta para pendente e precisa de nova aprovação.</p>}
      <footer className="form-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!valid||busy||saving}><Save size={16}/>Salvar valor e recalcular</button></footer>
    </form>
  </section></div>;
}
