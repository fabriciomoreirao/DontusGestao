"use client";
import { useRef, useState, type FormEvent } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { liaClientPayload, liaClientRowError, type LiaCatalog, type LiaClientRow } from "@/lib/lia-journey";
import LiaPlanField from "@/app/LiaPlanField";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import { PhoneInput } from "@/app/PhoneLink";

type Employee = { id: string; displayName: string; departmentName: string; active: boolean };
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const makeRow = (): LiaClientRow => ({ key: crypto.randomUUID(), name: "", clientId: "", liaPlan: "", value: "0", whatsapp: "", requestType: "", origin: "", owner: "", startDate: todayKey() });

export default function LiaClientEntryModal({ existingIds, employees, catalogs, currentUser, busy, completed = false, onClose, onSave }: {
  existingIds: string[]; employees: Employee[]; catalogs: LiaCatalog[]; currentUser: string; busy: boolean; completed?: boolean;
  onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [rows, setRows] = useState<LiaClientRow[]>(() => [makeRow()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [processed, setProcessed] = useState(0);
  const saving = useRef(false);
  const requestTypes = catalogs.filter(entry => entry.active && entry.catalog === "liaRequestType");
  const origins = catalogs.filter(entry => entry.active && entry.catalog === "liaOrigin");
  const patch = (key: string, values: Partial<LiaClientRow>) => setRows(current => current.map(row => row.key === key ? { ...row, ...values } : row));
  const title = completed ? "Subir clientes concluídos · LIA" : "Inserir cliente manualmente";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || busy) return;
    const seen = [...existingIds];
    for (const [index, row] of rows.entries()) {
      const invalid = liaClientRowError(row, seen, todayKey());
      if (invalid) { setError(`Cliente #${index + 1}: ${invalid}`); return; }
      seen.push(row.clientId);
    }
    saving.current = true; setSending(true); setError("");
    try {
      for (const row of rows) {
        const result = await onSave(liaClientPayload(row, currentUser, completed, new Date().toISOString(), crypto.randomUUID()));
        if (!result) { setError(`Não foi possível salvar ${row.name}. Os clientes já salvos foram removidos desta lista; tente novamente os restantes.`); return; }
        setProcessed(value => value + 1);
        setRows(current => current.filter(entry => entry.key !== row.key));
      }
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar os clientes restantes."); }
    finally { saving.current = false; setSending(false); }
  }
  return <div className="modal-backdrop nested-modal" onMouseDown={event => event.target === event.currentTarget && !sending && onClose()}><section role="dialog" aria-modal="true" aria-label={title} className={`standard-modal lia-client-entry-modal ${completed ? "lia-client-bulk-modal" : ""}`}>
    <header><div><p className="eyebrow">ACOMPANHAMENTO LIA</p><h2>{title}</h2><p>{completed ? "Adicione clientes já concluídos, com plano, valor e início do acompanhamento." : "O cliente entra na etapa de validação antes do onboarding."}</p></div><button type="button" className="icon-button" disabled={sending} aria-label="Fechar" onClick={onClose}><X /></button></header>
    <form onSubmit={event => void submit(event)}><div className="lia-entry-scroll">{rows.map((row, index) => <fieldset disabled={sending} className="lia-entry-row" key={row.key}><legend>Cliente #{index + 1}</legend>{completed && rows.length > 1 && <button type="button" className="icon-button lia-entry-remove" aria-label={`Remover cliente ${index + 1}`} onClick={() => setRows(current => current.filter(entry => entry.key !== row.key))}><Trash2 size={16} /></button>}
      <div className="lia-entry-fields"><label className="lia-entry-name">Nome do cliente *<input required value={row.name} onChange={event => patch(row.key, { name: event.target.value })} /></label><label>ID do cliente *<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={row.clientId} onChange={event => patch(row.key, { clientId: event.target.value.replace(/\D/g, "").slice(0, 6) })} /></label>
        <LiaPlanField catalogs={catalogs} value={row.liaPlan} onChange={liaPlan => patch(row.key, { liaPlan })} /><label>Valor do cliente (R$) *<input required type="number" min="0" max="1000000000" step="0.01" value={row.value} onChange={event => patch(row.key, { value: event.target.value })} /></label>
        <label>Início do acompanhamento *<input required type="date" max={todayKey()} value={row.startDate} onChange={event => patch(row.key, { startDate: event.target.value })} /></label><label>WhatsApp<PhoneInput value={row.whatsapp} onChange={event => patch(row.key, { whatsapp: event.target.value })} /></label>
        <label>Tipo de solicitação *<select required value={row.requestType} onChange={event => patch(row.key, { requestType: event.target.value })}><option value="">Selecionar</option>{requestTypes.map(entry => <option key={entry.id}>{entry.name}</option>)}{!requestTypes.length && <option>Inserção manual</option>}</select></label>
        <label>Origem *<select required value={row.origin} onChange={event => patch(row.key, { origin: event.target.value })}><option value="">Selecionar</option>{origins.map(entry => <option key={entry.id}>{entry.name}</option>)}{!origins.length && <option>Inserção manual</option>}</select></label>
        <label>Responsável *<SearchablePeopleSelect searchLabel={`Responsável do cliente ${index + 1}`} required value={row.owner} onChange={event => patch(row.key, { owner: event.target.value })}><option value="">Selecionar responsável</option>{employees.filter(entry => entry.active).map(entry => <option value={entry.displayName} key={entry.id}>{entry.displayName} · {entry.departmentName}</option>)}</SearchablePeopleSelect></label>
      </div></fieldset>)}{completed && <button type="button" className="secondary-button lia-entry-add" disabled={sending || rows.length >= 500} onClick={() => setRows(current => [...current, makeRow()])}><Plus size={16} /> Adicionar outro cliente</button>}</div>
      {error && <p role="alert" className="form-error">{error}</p>}<footer><span role="status">{processed > 0 ? `${processed} cliente(s) salvo(s). ` : ""}{rows.length} cliente(s) para salvar</span><button type="button" className="secondary-button" disabled={sending} onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy || sending || !rows.length}><Save size={16} />{sending ? "Salvando clientes..." : completed ? "Importar clientes concluídos" : "Inserir cliente"}</button></footer>
    </form></section></div>;
}
