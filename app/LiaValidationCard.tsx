"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import LiaPlanField from "@/app/LiaPlanField";
import type { LiaCatalog } from "@/lib/lia-journey";

export default function LiaValidationCard({ owner, plan, employees, catalogs, busy, onConfirm }: {
  owner: string; plan: string; employees: Array<{ id: string; displayName: string; active: boolean }>;
  catalogs: LiaCatalog[]; busy: boolean; onConfirm: (owner: string, plan: string) => Promise<boolean>;
}) {
  const [responsible, setResponsible] = useState(employees.some(employee => employee.active && employee.displayName === owner) ? owner : "");
  const [liaPlan, setLiaPlan] = useState(plan);
  const [checked, setChecked] = useState(false);
  return <section className="journey-action-card lia-validation-card"><h3>Validação antes do onboarding</h3><p>Confira os dados, o plano contratado e o formulário do cliente. Selecione quem dará continuidade ao acompanhamento.</p>
    <div className="field-grid"><LiaPlanField catalogs={catalogs} value={liaPlan} onChange={setLiaPlan} disabled={busy} /><label>Encaminhar para o responsável *<SearchablePeopleSelect searchLabel="Responsável pelo onboarding LIA" value={responsible} disabled={busy} onChange={event => setResponsible(event.target.value)}><option value="">Selecionar colaborador</option>{employees.filter(employee => employee.active).map(employee => <option key={employee.id} value={employee.displayName}>{employee.displayName}</option>)}</SearchablePeopleSelect></label></div>
    <label className="checkbox-label"><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} />Conferi os dados e o plano contratado deste cliente.</label>
    <button type="button" className="primary-button" disabled={busy || !checked || !responsible || !liaPlan.trim()} onClick={() => void onConfirm(responsible, liaPlan)}><Check size={16} />Conferir e encaminhar para onboarding</button>
  </section>;
}
