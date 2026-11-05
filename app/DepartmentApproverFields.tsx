"use client";
import { useState } from "react";
import CheckboxMultiSelect from "./CheckboxMultiSelect";
import SearchablePeopleSelect from "./SearchablePeopleSelect";

export default function DepartmentApproverFields({ people, coordinatorUserIds = [], approverUserId, disabled = false }: { people: Array<{ id: string; label: string }>; coordinatorUserIds?: string[]; approverUserId?: string | null; disabled?: boolean }) {
  const [coordinators, setCoordinators] = useState(coordinatorUserIds);
  const [approver, setApprover] = useState(approverUserId || "");
  const selected = people.filter(person => coordinators.includes(person.id));
  return <div className="department-approver-fields wide">
    <CheckboxMultiSelect label="Coordenadores do setor" name="coordinatorUserIds" options={people} defaultValue={coordinatorUserIds} disabled={disabled} onSelectionChange={setCoordinators} />
    <label>Aprovador das tarefas<SearchablePeopleSelect name="approverUserId" searchLabel="Selecionar aprovador das tarefas" value={selected.some(person => person.id === approver) ? approver : ""} disabled={disabled} onChange={event => setApprover(event.target.value)}><option value="">Selecionar aprovador</option>{selected.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}</SearchablePeopleSelect><small>A configuração vale para todas as tarefas do setor, inclusive as já criadas.</small></label>
  </div>;
}
