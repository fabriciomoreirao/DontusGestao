"use client";

import { Copy, Save, Search, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Catalog = { id: string; name: string; catalog: string; description: string; active: boolean };
type Employee = { id: string; displayName: string; departmentName: string; active: boolean };
type Rule = { moduleId?: string; moduleName: string; collaboratorId?: string; collaboratorName?: string; type: "percentage" | "fixed"; percentage: number; fixedCents: number };
type Operate = (payload: Record<string, unknown>, success: string) => Promise<{ id?: string; referralRulesRevision?: string } | false>;

function existingRule(catalogs: Catalog[], person: Employee, module: Catalog) {
  for (const entry of catalogs.filter(entry => entry.catalog === "referralCommission" && entry.active)) {
    try {
      const rule = JSON.parse(entry.description) as Rule;
      if ((rule.collaboratorId ? rule.collaboratorId === person.id : rule.collaboratorName === person.displayName)
        && (rule.moduleId ? rule.moduleId === module.id : rule.moduleName === module.name)) return rule;
    } catch { /* Ignore an unrelated legacy configuration. */ }
  }
  return null;
}

export default function ReferralCommissionRules({ collaborator, collaborators, modules, catalogs, busy, operate }: {
  collaborator: Employee; collaborators: Employee[]; modules: Catalog[]; catalogs: Catalog[]; busy: boolean; operate: Operate;
}) {
  const [saving, setSaving] = useState(false);
  const [copyRevision, setCopyRevision] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const pending = useRef(false);
  const saveButton = useRef<HTMLButtonElement>(null);
  const disabled = busy || saving;
  const peers = collaborators.filter(person => person.active && person.id !== collaborator.id);
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const visible = peers.filter(person => normalize(`${person.displayName} ${person.departmentName}`).includes(normalize(query.trim())));
  const closeCopy = () => { if (pending.current) return; setCopyRevision(""); saveButton.current?.focus(); };
  const saveAll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || busy) return;
    const form = new FormData(event.currentTarget);
    const referralRules = modules.map(module => ({ moduleId: module.id, type: String(form.get(`${module.id}:type`)),
      percentage: Number(form.get(`${module.id}:percentage`)), fixedCents: Math.round(Number(form.get(`${module.id}:fixed`)) * 100) }));
    pending.current = true; setSaving(true);
    try {
      const result = await operate({ action: "saveReferralCommissionRules", collaboratorId: collaborator.id, referralRules }, `Todas as regras de ${collaborator.displayName} foram salvas.`);
      if (result && result.referralRulesRevision && peers.length) { setTargets([]); setQuery(""); setCopyRevision(result.referralRulesRevision); }
    } finally { pending.current = false; setSaving(false); }
  };
  const copy = async () => {
    if (pending.current || busy || !targets.length) return;
    pending.current = true; setSaving(true);
    try {
      const result = await operate({ action: "copyReferralCommissionRules", collaboratorId: collaborator.id,
        targetCollaboratorIds: targets, referralRulesRevision: copyRevision }, `Todas as regras foram copiadas para ${targets.length} colaborador(es).`);
      if (result) { setCopyRevision(""); saveButton.current?.focus(); }
    } finally { pending.current = false; setSaving(false); }
  };
  return <>
    <form className="referral-rules-form" onSubmit={event => void saveAll(event)}>
      <div className="referral-commission-list">{modules.map(module => {
        const rule = existingRule(catalogs, collaborator, module);
        return <div className="referral-rule-row" key={module.id}>
          <span><strong>{module.name}</strong><small>{rule ? "Regra configurada" : "Aguardando configuração"}</small></span>
          <label>Tipo<select name={`${module.id}:type`} disabled={disabled} defaultValue={rule?.type || "percentage"}><option value="percentage">Porcentagem</option><option value="fixed">Valor fixo</option></select></label>
          <label>Percentual (%)<input name={`${module.id}:percentage`} disabled={disabled} type="number" min="0" max="100" step="0.01" required defaultValue={rule?.percentage ?? 0} /></label>
          <label>Valor fixo (R$)<input name={`${module.id}:fixed`} disabled={disabled} type="number" min="0" step="0.01" required defaultValue={(rule?.fixedCents ?? 0) / 100} /></label>
        </div>;
      })}</div>
      <footer className="referral-rules-footer"><span>{modules.length} regras de <strong>{collaborator.displayName}</strong></span><button ref={saveButton} className="primary-button" disabled={disabled} type="submit"><Save size={16} />{saving ? "Salvando..." : "Salvar todas as regras"}</button></footer>
    </form>
    {copyRevision && createPortal(<div className="modal-backdrop action-modal-backdrop referral-copy-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeCopy(); }}>
      <section className="modal referral-copy-modal" role="dialog" aria-modal="true" aria-labelledby="referral-copy-title" onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); closeCopy(); }
        if (event.key === "Tab") {
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
          const first = focusable[0], last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <header className="modal-head"><div><span className="eyebrow">REGRAS SALVAS</span><h2 id="referral-copy-title">Copiar para outros colaboradores?</h2></div><button type="button" className="icon-button" disabled={disabled} aria-label="Fechar cópia de regras" onClick={closeCopy}><X size={19} /></button></header>
        <p>Todas as {modules.length} regras de <strong>{collaborator.displayName}</strong> serão copiadas, substituindo os percentuais, valores fixos e tipos dos colaboradores marcados.</p>
        <label className="referral-copy-search"><Search size={16} /><input type="search" autoFocus placeholder="Buscar colaborador ou setor..." aria-label="Buscar colaborador para copiar regras" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="referral-copy-list">{visible.map(person => <label key={person.id}><input type="checkbox" disabled={disabled} checked={targets.includes(person.id)} onChange={event => setTargets(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} /><span><strong>{person.displayName}</strong><small>{person.departmentName}</small></span></label>)}{!visible.length && <p>Nenhum colaborador encontrado.</p>}</div>
        <footer className="form-actions"><button type="button" className="secondary-button" disabled={disabled} onClick={closeCopy}>Não, concluir</button><button type="button" className="primary-button" disabled={disabled || !targets.length} onClick={() => void copy()}><Copy size={15} />{saving ? "Copiando..." : `Copiar regras (${targets.length})`}</button></footer>
      </section>
    </div>, document.querySelector(".app-shell") || document.body)}
  </>;
}
