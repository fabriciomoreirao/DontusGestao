"use client";
import { useState } from "react";
import SearchablePeopleSelect from "./SearchablePeopleSelect";
export default function DepartmentApproverFields({ people, coordinatorUserIds = [], approverUserId, disabled = false }: { people: Array<{ id: string; label: string }>; coordinatorUserIds?: string[]; approverUserId?: string | null; disabled?: boolean }) {
  const [approver, setApprover] = useState(approverUserId || "");
  return <div className="department-approver-fields wide">
    {coordinatorUserIds.map(id=><input key={id} type="hidden" name="coordinatorUserIds" value={id}/>)}
    <label>Aprovador das tarefas<SearchablePeopleSelect name="approverUserId" searchLabel="Selecionar aprovador das tarefas" value={approver} disabled={disabled} onChange={event => setApprover(event.target.value)}><option value="">Selecionar aprovador</option>{people.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}</SearchablePeopleSelect><small>Um aprovador por setor. As alterações valem imediatamente para todas as tarefas, inclusive as que aguardam aprovação.</small></label>
  </div>;
}
