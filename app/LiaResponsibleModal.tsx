"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";

export default function LiaResponsibleModal({ owner, employees, busy, onClose, onSave }: {
  owner: string; employees: Array<{ id: string; displayName: string; active: boolean }>;
  busy: boolean; onClose: () => void; onSave: (owner: string) => Promise<boolean>;
}) {
  const [nextOwner, setNextOwner] = useState(owner);
  return <div className="modal-backdrop nested-modal"><section className="standard-modal lia-owner-modal" role="dialog" aria-modal="true" aria-label="Alterar responsável LIA">
    <header><h2>Alterar responsável</h2><button type="button" className="icon-button" aria-label="Fechar alteração de responsável" onClick={onClose}><X /></button></header>
    <p>Responsável atual: <strong>{owner}</strong></p>
    <label>Novo responsável<SearchablePeopleSelect searchLabel="Novo responsável LIA" value={nextOwner} disabled={busy} onChange={event => setNextOwner(event.target.value)}><option value="">Selecionar colaborador</option>{employees.filter(employee => employee.active).map(employee => <option key={employee.id} value={employee.displayName}>{employee.displayName}</option>)}</SearchablePeopleSelect></label>
    <footer><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="primary-button" disabled={busy || !nextOwner || nextOwner === owner} onClick={() => void onSave(nextOwner).then(saved => saved && onClose())}><Check size={16} />Salvar responsável</button></footer>
  </section></div>;
}
