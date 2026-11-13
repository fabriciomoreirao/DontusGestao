"use client";
import { useEffect, useId, useRef, useState } from "react";
import { formatGoalValue, goalTargetError, goalTargetKind, parseGoalTarget } from "@/lib/goal-target";
import { goalMetricLabels } from "@/lib/goal-progress";

export default function GoalTargetFields({ metric: initialMetric = "salesValue", target, onMetricChange }: { metric?: string; target?: number; onMetricChange?: (metric: string) => void }) {
  const [metric, setMetric] = useState(initialMetric);
  const [raw, setRaw] = useState(target === undefined ? "" : String(target).replace(".", ","));
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const kind = goalTargetKind(metric);
  const value = parseGoalTarget(raw, metric);
  const error = goalTargetError(value, metric);
  useEffect(() => { input.current?.setCustomValidity(raw ? error : ""); }, [raw, error]);
  const label = kind === "money" ? "Valor da meta" : kind === "percentage" ? "Score desejado" : "Quantidade desejada";
  const hint = kind === "money" ? "Valor em reais, com até duas casas decimais." : kind === "percentage" ? "Porcentagem entre 0,01% e 100%." : "Quantidade em número inteiro, sem casas decimais.";
  return <>
    <label>Tipo *<select name="metric" required value={metric} onChange={event => { setMetric(event.target.value); onMetricChange?.(event.target.value); setRaw(""); setTouched(false); }}>
      {(["salesValue", "salesCount", "usageScore", "referralCount"] as const).map(key => <option key={key} value={key}>{goalMetricLabels[key]}</option>)}
      {initialMetric === "clientCount" && <option value="clientCount">{goalMetricLabels.clientCount}</option>}
    </select></label>
    <label htmlFor={id}>{label} *<span className={`goal-target-input ${kind}`}>
      {kind === "money" && <span aria-hidden="true">R$</span>}
      <input ref={input} id={id} required type="text" inputMode={kind === "integer" ? "numeric" : "decimal"} value={raw} aria-describedby={`${id}-hint${touched && error ? ` ${id}-error` : ""}`} aria-invalid={touched && !!error || undefined}
        placeholder={kind === "money" ? "0,00" : kind === "percentage" ? "Ex.: 80" : "Ex.: 20"}
        onChange={event => { setRaw(event.target.value); setTouched(true); event.target.setCustomValidity(event.target.value ? goalTargetError(parseGoalTarget(event.target.value, metric), metric) : ""); }}
        onInvalid={() => setTouched(true)} onBlur={() => { setTouched(true); if (!error && raw) setRaw(formatGoalValue(value, metric).replace(/R\$|%|\s/g, "")); }}/>
      {kind === "percentage" && <span aria-hidden="true">%</span>}
    </span><small className="field-hint" id={`${id}-hint`}>{hint}</small>{touched && error && <small className="goal-field-error" id={`${id}-error`} role="alert">{error}</small>}
    <input type="hidden" name="target" value={Number.isFinite(value) ? value : ""}/></label>
  </>;
}
