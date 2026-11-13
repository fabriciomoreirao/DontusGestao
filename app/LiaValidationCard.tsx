"use client";
import { useState } from "react";
import { Check, Send } from "lucide-react";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import LiaPlanField from "@/app/LiaPlanField";
import type { LiaCatalog } from "@/lib/lia-journey";

export default function LiaValidationCard({ owner, plan, employees, catalogs, busy, canAssign, hasForm, checked, onCheck, onAssign }: {
  owner: string; plan: string; employees: Array<{ id: string; displayName: string; active: boolean }>;
  catalogs: LiaCatalog[]; busy: boolean; canAssign: boolean; hasForm: boolean; checked: boolean;
  onCheck: (plan: string) => Promise<boolean>; onAssign: (owner: string, plan: string) => Promise<boolean>;
}) {
  const [responsible, setResponsible] = useState(employees.some(employee => employee.active && employee.displayName === owner) ? owner : "");
  const [liaPlan, setLiaPlan] = useState(plan);
  return <section className="journey-action-card lia-validation-card"><h3>Validação antes do onboarding</h3>
    <p>Gere o link do formulário acima e envie ao cliente. Depois, confira os dados para liberar o direcionamento ao responsável.</p>
    <LiaPlanField catalogs={catalogs} value={liaPlan} onChange={setLiaPlan} disabled={busy || checked || !canAssign}/>
    <button type="button" className={checked ? "secondary-button" : "primary-button"} disabled={busy || checked || !hasForm || !liaPlan.trim() || !canAssign} onClick={() => void onCheck(liaPlan)}><Check size={16}/>{checked ? "Dados conferidos" : "Conferir dados"}</button>
    {!hasForm && <p className="lia-validation-hint">Gere e envie o link do formulário para liberar a conferência.</p>}
    <label>Encaminhar para o responsável *<SearchablePeopleSelect searchLabel="Responsável pelo onboarding LIA" value={responsible} disabled={busy || !checked || !canAssign} onChange={event => setResponsible(event.target.value)}><option value="">Selecionar colaborador</option>{employees.filter(employee => employee.active).map(employee => <option key={employee.id} value={employee.displayName}>{employee.displayName}</option>)}</SearchablePeopleSelect></label>
    <button type="button" className="primary-button" disabled={busy || !checked || !responsible || !liaPlan.trim() || !canAssign} onClick={() => void onAssign(responsible, liaPlan)}><Send size={16}/>Direcionar para o responsável</button>
  </section>;
}
