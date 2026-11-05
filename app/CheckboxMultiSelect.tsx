"use client";

import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";

export default function CheckboxMultiSelect({ label, name, options, defaultValue = [], disabled = false, hint, onSelectionChange }: {
  label: string; name: string; options: Array<{ id: string; label: string }>;
  defaultValue?: string[]; disabled?: boolean; hint?: string; onSelectionChange?: (value: string[]) => void;
}) {
  const [selected, setSelected] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const normalize = (value:string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const visible = options.filter(option => normalize(option.label).includes(normalize(query.trim())));
  return <div className="checkbox-multiselect wide">
    <span className="checkbox-multiselect-label">{label}</span>
    {selected.map(id => <input key={id} type="hidden" name={name} value={id} disabled={disabled} />)}
    <details onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
      <summary aria-label={label} aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}><span>{selected.length ? `${selected.length} selecionado(s)` : "Selecionar pessoas"}</span><ChevronDown size={16} /></summary>
      {!disabled && <div className="checkbox-multiselect-popover">
        <label className="checkbox-multiselect-search"><Search size={14} /><input type="search" aria-label={`Buscar em ${label}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar pessoa..." /></label>
        <div className="checkbox-multiselect-options">{visible.map(option => <label key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={event => { const next = event.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id); setSelected(next); onSelectionChange?.(next); }} /><span>{option.label}</span></label>)}{!visible.length && <p>Nenhuma pessoa encontrada.</p>}</div>
        <button type="button" className="secondary-button compact" onClick={event => { event.currentTarget.closest("details")!.open = false; }}>Concluir seleção</button>
      </div>}
    </details>
    {hint && <small>{hint}</small>}
  </div>;
}
