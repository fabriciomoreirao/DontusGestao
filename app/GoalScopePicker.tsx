"use client";

import { useId, useState } from "react";

export default function GoalScopePicker({ label, allLabel, name, options, all, values, onChange, hint }: {
  label: string; allLabel: string; name: string; options: Array<{ key: string; label: string }>;
  all: boolean; values: string[]; onChange: (all: boolean, values: string[]) => void; hint?: string;
}) {
  const [query, setQuery] = useState("");
  const id = useId();
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = options.filter(option => normalize(option.label).includes(normalize(query.trim())));
  const invalid = !all && !values.length;
  return <fieldset className="goal-scope-picker wide" aria-describedby={`${id}-hint`}>
    <legend>{label}</legend>
    <input type="hidden" name={`${name}Mode`} value={all ? "all" : "selected"}/>
    {!all && values.map(value => <input key={value} type="hidden" name={name} value={value}/>)}
    <label className="goal-scope-all"><input type="checkbox" checked={all}
      ref={node => { node?.setCustomValidity(invalid ? `Marque uma opção de ${label.toLowerCase()} ou ${allLabel.toLowerCase()}.` : ""); }}
      onChange={event => onChange(event.target.checked, [])}/><span>{allLabel}</span><small>{all ? "Todos" : `${values.length} ${values.length === 1 ? "selecionado" : "selecionados"}`}</small></label>
    {options.length > 6 && <input className="goal-scope-search" type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={`Buscar ${label.toLowerCase()}`} placeholder="Buscar opção..."/>}
    <div className="goal-scope-options">{visible.map(option => <label key={option.key}><input type="checkbox" checked={all || values.includes(option.key)} onChange={event => {
      const selected = all ? options.map(entry => entry.key) : values;
      onChange(false, event.target.checked ? [...new Set([...selected, option.key])] : selected.filter(value => value !== option.key));
    }}/><span>{option.label}</span></label>)}{!visible.length && <p>Nenhuma opção disponível.</p>}</div>
    <small className={invalid ? "goal-field-error" : "field-hint"} id={`${id}-hint`}>{invalid ? "Marque pelo menos uma opção ou selecione todos." : hint}</small>
  </fieldset>;
}
