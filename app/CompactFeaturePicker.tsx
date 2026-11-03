"use client";

import { Check, Plus, Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function CompactFeaturePicker({ label, options, selected, alwaysVisible = [], disabled, onChange }: {
  label: string; options: Array<{ name: string }>; selected: string[]; alwaysVisible?: string[]; disabled: boolean;
  onChange: (values: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const names = [...new Set([...options.map(option => option.name), ...selected])];
  const visible = [...new Set([...alwaysVisible.filter(name => names.includes(name)), ...selected])];
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const matches = names.filter(name => normalize(name).includes(normalize(query.trim())));
  const close = () => { if (saving) return; setOpen(false); trigger.current?.focus(); };
  const apply = async () => {
    if (disabled || saving) return;
    setSaving(true);
    try { if (await onChange(draft)) { setOpen(false); trigger.current?.focus(); } }
    finally { setSaving(false); }
  };
  return <fieldset className="cs-feature-picker cs-feature-picker-compact"><legend>{label} ({selected.length})</legend>
    <div>{visible.map(name => <button type="button" disabled={disabled} aria-pressed={selected.includes(name)} className={selected.includes(name) ? "selected" : ""} key={name} onClick={() => void onChange(selected.includes(name) ? selected.filter(value => value !== name) : [...selected, name])}><Check size={12} />{name}</button>)}
      {!visible.length && <small>{label === "ETIQUETAS" ? "Nenhuma etiqueta selecionada." : "Nenhuma funcionalidade adicional selecionada."}</small>}
      {names.length > 0 && <button type="button" ref={trigger} className="cs-feature-select" disabled={disabled} onClick={() => { setDraft([...selected]); setQuery(""); setOpen(true); }}><Plus size={13} />{label === "ETIQUETAS" ? "Selecionar etiquetas" : "Selecionar funcionalidades"}</button>}
    </div>
    {open && createPortal(<div className="modal-backdrop action-modal-backdrop cs-feature-choice-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="modal cs-feature-choice-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
        if (event.key === "Tab") {
          const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
          if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
          else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
        }
      }}>
        <header className="modal-head"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2 id={titleId}>{label === "ETIQUETAS" ? "Selecionar etiquetas" : `Selecionar funcionalidades · ${label.toLocaleLowerCase("pt-BR")}`}</h2></div><button type="button" className="icon-button" disabled={saving} aria-label="Fechar seleção" onClick={close}><X size={19} /></button></header>
        <p>Marque as opções que deseja exibir no card.</p>
        <label className="referral-copy-search"><Search size={16} /><input type="search" autoFocus aria-label="Buscar opções" placeholder="Digite para buscar..." value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="cs-feature-choice-list">{matches.map(name => <label key={name}><input type="checkbox" disabled={disabled || saving} checked={draft.includes(name)} onChange={event => setDraft(current => event.target.checked ? [...current, name] : current.filter(value => value !== name))} /><span>{name}</span></label>)}{!matches.length && <p>Nenhuma opção encontrada.</p>}</div>
        <footer className="form-actions"><span>{draft.length} selecionada(s)</span><button type="button" className="secondary-button" disabled={saving} onClick={close}>Cancelar</button><button type="button" className="primary-button" disabled={disabled || saving} onClick={() => void apply()}><Check size={15} />{saving ? "Salvando..." : "Aplicar seleção"}</button></footer>
      </section>
    </div>, document.querySelector(".app-shell") || document.body)}
  </fieldset>;
}
