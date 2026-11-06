"use client";

import SearchableSelect from "./SearchableSelect";
import SupportAccessFilters from "./SupportAccessFilters";
import SupportAccessIndicators from "./SupportAccessIndicators";
import {emptyAccessFilters,supportAccessQuery,validAccessPeriod,type AccessFilters} from "@/lib/support-access-indicators";
import { ArrowLeft, BarChart3, Check, History, Pencil, RefreshCw, Save, Search, Settings, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { dontusIntegrationApi as api } from "@/lib/dontus-integration-api";
import useDialogFocus from "@/app/useDialogFocus";

export type SupportAccessReason = { id: string; name: string; active: boolean; version: number; departmentId: string | null; departmentName: string };
type AccessDepartment = { id: string; name: string; active: boolean };
type Log = { id: string; accessedAt: string; actorEmail: string; actorName: string; identification: string; customerName: string; targetUserName: string; reasonId: string; reasonName: string; justification: string };
type HistoryResult = { entries: Log[]; total: number; page: number; pageSize: number; responsible: Array<{ email: string; name: string }> };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const timestamp = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function SupportAccessReasonModal({ userName, customerName, identification, reasons, loading, busy, error, onClose, onConfirm }: {
  userName: string; customerName: string; identification: string; reasons: SupportAccessReason[]; loading: boolean; busy: boolean; error: string;
  onClose: () => void; onConfirm: (reasonId: string, justification: string) => void;
}) {
  const [reasonId, setReasonId] = useState("");
  const [justification, setJustification] = useState("");
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, () => { if (!busy) onClose(); });
  const activeReasons = reasons.filter(reason => reason.active);
  const submit = (event: FormEvent) => { event.preventDefault(); if (activeReasons.some(reason => reason.id === reasonId) && justification.trim()) onConfirm(reasonId, justification.trim()); };
  return <div className="modal-backdrop support-access-reason-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialog} className="modal support-access-reason-modal" role="dialog" aria-modal="true" aria-labelledby="support-reason-title" tabIndex={-1}>
      <header className="modal-head"><div><span className="eyebrow">ACESSO À BASE</span><h2 id="support-reason-title">Informe o motivo do acesso</h2><p>{customerName || "Cliente Dontus"} · ID {identification} · {userName}</p></div><button type="button" className="icon-button" disabled={busy} aria-label="Fechar motivo do acesso" onClick={onClose}><X /></button></header>
      <form className="support-access-reason-form" onSubmit={submit}>
        <label>Motivo cadastrado *<SearchableSelect label="Pesquisar motivo do acesso" required value={reasonId} onChange={setReasonId} disabled={busy||loading} placeholder={loading?"Carregando motivos…":"Digite para pesquisar um motivo"} options={activeReasons.map(reason=>({value:reason.id,label:reason.name,description:reason.departmentName}))}/><small className="field-hint">Pesquise pelo nome do motivo ou pelo setor e selecione uma opção da lista.</small></label>
        <label>Descrição do motivo *<textarea required rows={4} maxLength={2000} disabled={busy} value={justification} onChange={event => setJustification(event.target.value)} placeholder="Descreva por que precisa acessar esta base e o atendimento relacionado." /></label>
        {!loading && activeReasons.length === 0 && <p role="status">Nenhum motivo ativo disponível para os seus setores. Confira os vínculos do colaborador e os motivos cadastrados em Configuração.</p>}
        {error && <p className="dontus-integration-error" role="alert">{error}</p>}
        <p>O responsável, a data e o motivo serão registrados no histórico antes da liberação do acesso.</p>
        <footer className="form-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy || loading || !activeReasons.some(reason => reason.id === reasonId) || !justification.trim()}><Check size={16} />{busy ? "Liberando acesso…" : "Registrar motivo e acessar"}</button></footer>
      </form>
    </section>
  </div>;
}

export function AccessPanelHeading({ title, children, onBack, actions, backLabel = "Voltar ao acesso de suporte" }: { title: string; children: ReactNode; onBack: () => void; actions?:ReactNode; backLabel?:string }) {
  return <header className="dontus-integration-heading support-access-subheading"><button className="icon-button" type="button" onClick={onBack} aria-label={backLabel}><ArrowLeft /></button><div><span className="eyebrow">ACESSO DE SUPORTE</span><h1>{title}</h1><p>{children}</p></div>{actions&&<div className="support-access-heading-actions">{actions}</div>}</header>;
}

export function SupportAccessHistory({ reasons, onBack }: { reasons: SupportAccessReason[]; onBack: () => void }) {
  const [filters, setFilters] = useState<AccessFilters>({...emptyAccessFilters});
  const [view,setView]=useState<"history"|"indicators">("history");
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if(view!=="history")return;
    const controller = new AbortController();
    setBusy(true); setError("");
    const query = supportAccessQuery(applied,page);
    void api<HistoryResult>(`access/history?${query}`, undefined, controller.signal).then(value => { if (!controller.signal.aborted) setResult(value); }).catch(error => { if (!controller.signal.aborted) { setError(errorMessage(error)); setResult(null); } }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [applied, page, view]);
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 20)));
  const submit = (event: FormEvent) => { event.preventDefault(); if (!validAccessPeriod(filters)) { setError("A data inicial deve ser anterior ou igual à data final."); return; } setError(""); setPage(1); setApplied({ ...filters }); };
  const clear=()=>{setFilters({...emptyAccessFilters});setApplied({...emptyAccessFilters});setPage(1);setError("")};
  const indicators=()=>{if(!validAccessPeriod(filters)){setError("A data inicial deve ser anterior ou igual à data final.");return}setError("");setApplied({...filters});setPage(1);setView("indicators")};
  if(view==="indicators")return <SupportAccessIndicators filters={filters} applied={applied} onFilters={setFilters} onApply={submit} onClear={clear} onBack={()=>setView("history")} responsible={result?.responsible||[]} reasons={reasons} validationError={error}/>;
  return <section className="support-access-page support-access-history" aria-busy={busy}>
    <AccessPanelHeading title="Histórico de acesso" onBack={onBack} actions={<button type="button" className="primary-button" disabled={busy||!result} onClick={indicators}><BarChart3 size={18} aria-hidden="true"/>Indicadores</button>}>Acessos liberados pelo Suporte. Datas e horários de Brasília.</AccessPanelHeading>
    <section className="support-access-panel"><div className="support-access-title"><History size={18} /> Histórico de acesso às bases</div>
      <SupportAccessFilters filters={filters} onChange={setFilters} onApply={submit} onClear={clear} responsible={result?.responsible||[]} reasons={reasons} busy={busy}/>
      {error && <p className="dontus-integration-error" role="alert">{error}</p>}
      <p className="dontus-access-meta" role="status">{busy ? "Consultando histórico…" : `${result?.total ?? 0} acesso(s) encontrado(s)`}</p>
      <div className="support-access-log-scroll"><table className="support-access-log-table"><thead><tr><th>Data e horário</th><th>Responsável</th><th>Cliente / base</th><th>Usuário acessado</th><th>Motivo e descrição</th></tr></thead><tbody>{!busy && result?.entries.map(entry => <tr key={entry.id}><td>{timestamp(entry.accessedAt)}</td><td><strong>{entry.actorName}</strong><small>{entry.actorEmail}</small></td><td><strong>{entry.customerName || "Cliente Dontus"}</strong><small>ID {entry.identification}</small></td><td>{entry.targetUserName}</td><td><strong>{entry.reasonName}</strong><p>{entry.justification}</p></td></tr>)}</tbody></table></div>
      {!busy && !error && result?.entries.length === 0 && <p className="support-access-empty">Nenhum acesso registrado para os filtros selecionados.</p>}
      {result && result.total > 0 && <nav className="dontus-users-pagination" aria-label="Páginas do histórico de acesso"><span>Página {result.page} de {totalPages}</span><div><button type="button" className="secondary-button" disabled={busy || result.page <= 1} onClick={() => setPage(result.page - 1)}>Anterior</button><button type="button" className="secondary-button" disabled={busy || result.page >= totalPages} onClick={() => setPage(result.page + 1)}>Próxima</button></div></nav>}
    </section>
  </section>;
}

export function SupportAccessSettings({ onUpdated, onBack }: { onUpdated: (reason: SupportAccessReason) => void; onBack: () => void }) {
  const [reasons, setReasons] = useState<SupportAccessReason[]>([]);
  const [departments, setDepartments] = useState<AccessDepartment[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [targetDepartment, setTargetDepartment] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<SupportAccessReason | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let request = 0;
    const load = async () => {
      const current = ++request;
      setLoading(true); setError("");
      try {
        const [sectors, catalog] = await Promise.all([api<AccessDepartment[]>("access/departments", undefined, controller.signal), api<SupportAccessReason[]>("access/reasons?catalog=true", undefined, controller.signal)]);
        if (controller.signal.aborted || request !== current) return;
        setDepartments(sectors); setReasons(catalog);
        setSelectedDepartment(value => value === "unassigned" && catalog.some(reason => !reason.departmentId) || sectors.some(sector => sector.id === value) ? value : sectors.find(sector => sector.active)?.id || (catalog.some(reason => !reason.departmentId) ? "unassigned" : ""));
      } catch (error) { if (!controller.signal.aborted && request === current) setError(errorMessage(error)); }
      finally { if (!controller.signal.aborted && request === current) setLoading(false); }
    };
    void load();
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); };
  }, [revision]);
  const edit = (reason: SupportAccessReason | null) => { setEditing(reason); setName(reason?.name ?? ""); setActive(reason?.active ?? true); setTargetDepartment(reason?.departmentId ?? ""); setError(""); setNotice(""); };
  const tabs = departments.filter(department => department.active || reasons.some(reason => reason.departmentId === department.id));
  const department = departments.find(entry => entry.id === selectedDepartment);
  const scoped = reasons.filter(reason => selectedDepartment === "unassigned" ? !reason.departmentId : reason.departmentId === selectedDepartment);
  const departmentId = editing ? targetDepartment : department?.id;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const saved = await api<SupportAccessReason>("access/reasons", { id: editing?.id, name: name.trim(), active, version: editing?.version, departmentId }); setReasons(current => [...current.filter(reason => reason.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))); onUpdated(saved); edit(null); setSelectedDepartment(saved.departmentId ?? "unassigned"); setNotice("Motivo de acesso salvo no setor."); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  };
  return <section className="support-access-page"><AccessPanelHeading title="Configuração dos motivos de acesso" onBack={onBack}>Cadastre os motivos por setor. O colaborador verá os motivos de todos os setores aos quais está vinculado.</AccessPanelHeading>
    <section className="support-access-panel"><div className="support-access-title"><Settings size={18} /> Motivos de acesso às bases</div>
      <div className="support-access-sector-heading"><span>Setores cadastrados{loading ? " · Atualizando…" : ""}</span><button className="secondary-button" type="button" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} />Atualizar setores</button></div>
      <div className="support-access-sector-tabs" role="tablist" aria-label="Setores dos motivos de acesso">{tabs.map(sector => <button type="button" role="tab" aria-selected={selectedDepartment === sector.id} aria-controls="support-sector-reasons" id={`support-sector-${sector.id}`} disabled={busy} key={sector.id} onClick={() => { setSelectedDepartment(sector.id); edit(null); }}>{sector.name}{!sector.active ? " · Inativo" : ""}<b>{reasons.filter(reason => reason.departmentId === sector.id).length}</b></button>)}{reasons.some(reason => !reason.departmentId) && <button type="button" role="tab" aria-selected={selectedDepartment === "unassigned"} id="support-sector-unassigned" aria-controls="support-sector-reasons" disabled={busy} onClick={() => { setSelectedDepartment("unassigned"); edit(null); }}>Sem setor<b>{reasons.filter(reason => !reason.departmentId).length}</b></button>}</div>
      {!loading && tabs.length === 0 && <p className="support-access-empty">Cadastre um setor em Colaboradores ou Cadastros para configurar seus motivos de acesso.</p>}
      {selectedDepartment && <section role="tabpanel" id="support-sector-reasons" aria-labelledby={`support-sector-${selectedDepartment}`}>
      {selectedDepartment === "unassigned" && <p className="dontus-access-meta">Vincule os motivos antigos a um setor para disponibilizá-los aos colaboradores.</p>}
      {(selectedDepartment !== "unassigned" || editing) && <form className="support-access-reason-editor" onSubmit={submit}><label>{editing ? "Editar motivo" : `Novo motivo · ${department?.name ?? ""}`}<input required maxLength={120} value={name} disabled={busy || loading} onChange={event => setName(event.target.value)} placeholder="Nome do motivo de acesso" /></label>{editing && <label>Setor do motivo<select required value={targetDepartment} disabled={busy || loading} onChange={event => setTargetDepartment(event.target.value)}><option value="">Selecione um setor</option>{departments.filter(entry => entry.active || entry.id === editing.departmentId).map(entry => <option value={entry.id} key={entry.id}>{entry.name}{entry.active ? "" : " · Inativo"}</option>)}</select></label>}<label className="checkbox-label"><input type="checkbox" checked={active} disabled={busy || loading} onChange={event => setActive(event.target.checked)} />Ativo</label><button className="primary-button" disabled={busy || loading || !name.trim() || !departmentId} type="submit"><Save size={16} />{busy ? "Salvando…" : "Salvar motivo"}</button>{editing && <button className="secondary-button" type="button" disabled={busy} onClick={() => edit(null)}>Cancelar edição</button>}</form>}
      <div className="support-access-reason-list">{scoped.length === 0 ? <p className="support-access-empty">Nenhum motivo cadastrado neste setor.</p> : scoped.map(reason => <article key={reason.id}><strong>{reason.name}</strong><b className={`status-pill ${reason.active ? "positive" : "negative"}`}>{reason.active ? "Ativo" : "Inativo"}</b><button className="secondary-button" type="button" disabled={busy || loading} aria-label={`Editar motivo ${reason.name}`} onClick={() => edit(reason)}><Pencil size={15} />Editar</button></article>)}</div>
      </section>}
      {error && <p className="dontus-integration-error" role="alert">{error}</p>}{notice && <p className="dontus-access-meta" role="status">{notice}</p>}
    </section>
  </section>;
}
