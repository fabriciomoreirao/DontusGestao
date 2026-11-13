"use client";
import { useRef, useState, type FormEvent } from "react";
import { Save, X } from "lucide-react";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import { PhoneInput } from "@/app/PhoneLink";
import LiaPlanField from "@/app/LiaPlanField";
import useDialogFocus from "@/app/useDialogFocus";
import type { LiaCatalog } from "@/lib/lia-journey";

export type LiaClientEdit = { name: string; owner: string; whatsapp: string; liaPlan: string; origin: string };
export default function LiaClientEditModal({ initial, employees, catalogs, busy, canChangeOwner, onClose, onSave }: {
  initial: LiaClientEdit; employees: Array<{ id: string; displayName: string; active: boolean }>;
  catalogs: LiaCatalog[]; busy: boolean; canChangeOwner: boolean; onClose: () => void; onSave: (data: LiaClientEdit) => Promise<boolean>;
}) {
  const [data, setData] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLElement>(null);
  const savingRef = useRef(false);
  const close = () => { if (!busy && !savingRef.current) onClose(); };
  useDialogFocus(dialog, close);
  const origins = catalogs.filter(entry => entry.active && entry.catalog === "liaOrigin").map(entry => entry.name);
  const patch = (next: Partial<LiaClientEdit>) => setData(current => ({ ...current, ...next }));
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try { if (await onSave({ ...data, name: data.name.trim(), liaPlan: data.liaPlan.trim(), origin: data.origin.trim() })) onClose(); else setError("Não foi possível salvar. Confira os dados e tente novamente."); }
    catch { setError("Não foi possível salvar. Tente novamente."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <div className="modal-backdrop nested-modal lia-client-edit-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section ref={dialog} className="standard-modal lia-client-edit-modal" data-detail-enhancement="disabled" role="dialog" aria-modal="true" aria-labelledby="lia-client-edit-title" tabIndex={-1}>
    <header className="modal-head"><div><span className="eyebrow">ACOMPANHAMENTO LIA</span><h2 id="lia-client-edit-title">Editar dados do cliente</h2><p>Atualize o cadastro e o responsável pelo acompanhamento.</p></div><button type="button" className="icon-button" aria-label="Fechar edição LIA" disabled={busy || saving} onClick={close}><X/></button></header>
    <form onSubmit={event => void submit(event)}><fieldset disabled={busy || saving} className="lia-client-edit-fields">
      <label className="wide">Nome do cliente *<input required autoFocus maxLength={240} value={data.name} onChange={event => patch({ name: event.target.value })}/></label>
      <label>Responsável *<SearchablePeopleSelect searchLabel="Responsável pelo cliente LIA" disabled={!canChangeOwner} required value={data.owner} onChange={event => patch({ owner: event.target.value })}><option value="">Selecionar colaborador</option>{employees.filter(entry => entry.active).map(entry => <option key={entry.id} value={entry.displayName}>{entry.displayName}</option>)}</SearchablePeopleSelect></label>
      <label>WhatsApp<PhoneInput value={data.whatsapp} onChange={event => patch({ whatsapp: event.target.value })}/></label>
      <LiaPlanField catalogs={catalogs} value={data.liaPlan} onChange={liaPlan => patch({ liaPlan })}/>
      <label>Origem *{origins.length ? <select required value={data.origin} onChange={event => patch({ origin: event.target.value })}><option value="">Selecionar origem</option>{data.origin && !origins.includes(data.origin) && <option>{data.origin}</option>}{origins.map(origin => <option key={origin}>{origin}</option>)}</select> : <input required maxLength={160} value={data.origin} onChange={event => patch({ origin: event.target.value })}/>}</label>
    </fieldset>{error && <p role="alert" className="form-error">{error}</p>}<footer><button type="button" className="secondary-button" disabled={busy || saving} onClick={close}>Cancelar</button><button type="submit" className="primary-button" disabled={busy || saving}><Save size={16}/>{saving ? "Salvando..." : "Salvar alterações"}</button></footer></form>
  </section></div>;
}
