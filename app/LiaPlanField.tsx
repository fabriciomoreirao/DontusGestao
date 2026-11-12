"use client";
import { liaPlanOptions, type LiaCatalog } from "@/lib/lia-journey";

export default function LiaPlanField({ catalogs, value, onChange, disabled = false }: { catalogs: LiaCatalog[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const plans = liaPlanOptions(catalogs);
  return <label>Plano LIA contratado *{plans.length ? <select required value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
    <option value="">Selecionar plano LIA</option>{value && !plans.includes(value) && <option>{value}</option>}{plans.map(plan => <option key={plan}>{plan}</option>)}
  </select> : <input required maxLength={160} value={value} disabled={disabled} placeholder="Informe o plano contratado" onChange={event => onChange(event.target.value)} />}</label>;
}
