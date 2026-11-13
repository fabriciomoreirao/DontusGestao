"use client";

import { useState } from "react";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import GoalScopePicker from "@/app/GoalScopePicker";
import { commercialGoalFunnels, isCommercialGoalDepartment } from "@/lib/goal-progress";
import { goalModuleKey, goalModuleOptions, isModuleGoalFunnel, selectedGoalFunnels, type GoalScope, type GoalScopeCatalog } from "@/lib/goal-scope";

type Employee = { id: string; displayName: string; departmentName: string; departmentNames: string[]; active: boolean };
type Department = { id: string; name: string; active: boolean };
type Goal = GoalScope & { departmentId: string; employeeId: string };
export const goalFunnelKey = (funnel: { id: string; name: string }) => funnel.id || `name:${funnel.name}`;
export function goalFunnelChoices(catalogs: GoalScopeCatalog[], goal: GoalScope = {}) {
  const active = commercialGoalFunnels(catalogs).map(entry => ({ id: entry.id, name: entry.name, key: entry.id, label: entry.name }));
  for (const funnel of selectedGoalFunnels(goal)) if (!active.some(entry => entry.key === goalFunnelKey(funnel))) {
    const name = catalogs.find(entry => entry.id === funnel.id)?.name || funnel.name || "Funil anterior";
    active.push({ ...funnel, name, key: goalFunnelKey(funnel), label: `${name} (indisponível)` });
  }
  return active;
}
export function goalModuleChoices(catalogs: GoalScopeCatalog[], goal: GoalScope = {}) {
  const active = goalModuleOptions(catalogs);
  for (const selection of goal.modules || []) if (!active.some(entry => entry.key === goalModuleKey(selection)))
    active.push({ ...selection, key: goalModuleKey(selection), label: `${selection.plan || selection.productName} (indisponível)` });
  return active;
}
export function goalScopeFromForm(form: FormData, catalogs: GoalScopeCatalog[], previous: GoalScope = {}): GoalScope {
  const keys = form.getAll("funnelKeys").map(String);
  const funnels = goalFunnelChoices(catalogs, previous).filter(entry => keys.includes(entry.key)).map(({ id, name }) => ({ id, name }));
  const scope: GoalScope = { funnels, funnelId: funnels.length === 1 ? funnels[0].id : "", funnelName: funnels.length === 1 ? funnels[0].name : "", modules: [] };
  if (form.get("moduleScope") === "moduleFunnels") {
    const moduleKeys = form.getAll("moduleKeys").map(String);
    scope.moduleScope = "moduleFunnels";
    scope.modules = goalModuleChoices(catalogs, previous).filter(entry => moduleKeys.includes(entry.key)).map(({ productId, productName, plan }) => ({ productId, productName, plan }));
  }
  return scope;
}

export default function GoalAssignmentFields({ employees, departments, catalogs, goal, metric }: {
  employees: Employee[]; departments: Department[]; catalogs: GoalScopeCatalog[]; goal?: Goal; metric: string;
}) {
  const initial = selectedGoalFunnels(goal || {});
  const [sector, setSector] = useState(goal?.departmentId || "");
  const [employee, setEmployee] = useState(goal?.employeeId || "");
  const [allFunnels, setAllFunnels] = useState(!initial.length);
  const [funnelKeys, setFunnelKeys] = useState(initial.map(goalFunnelKey));
  const [allModules, setAllModules] = useState(!goal?.modules?.length);
  const [moduleKeys, setModuleKeys] = useState((goal?.modules || []).map(goalModuleKey));
  const department = departments.find(entry => entry.id === sector);
  const funnels = goalFunnelChoices(catalogs, goal);
  const modules = goalModuleChoices(catalogs, goal);
  const showFunnels = isCommercialGoalDepartment(department?.name || "") && ["salesValue", "salesCount"].includes(metric);
  const showModules = showFunnels && !allFunnels && funnels.some(funnel => funnelKeys.includes(funnel.key) && isModuleGoalFunnel(funnel, catalogs));
  return <>
    <label>Colaborador<SearchablePeopleSelect searchLabel="Colaborador" name="employeeId" value={employee} onChange={event => setEmployee(event.target.value)}><option value="">Todo o setor</option>{employees.filter(entry => entry.active && (!department || [entry.departmentName, ...entry.departmentNames].includes(department.name))).map(entry => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</SearchablePeopleSelect></label>
    <label>Setor<select name="departmentId" value={sector} onChange={event => { setSector(event.target.value); setEmployee(""); setAllFunnels(true); setFunnelKeys([]); setAllModules(true); setModuleKeys([]); }}><option value="">Todos os setores</option>{departments.filter(entry => entry.active).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    {showFunnels && <GoalScopePicker label="Funis comerciais" allLabel="Todos os funis" name="funnelKeys" options={funnels} all={allFunnels} values={funnelKeys}
      onChange={(all, keys) => { setAllFunnels(all); setFunnelKeys(keys); }} hint="Marque um ou mais funis. Cada card será contabilizado uma única vez."/>}
    {showModules && <><input type="hidden" name="moduleScope" value="moduleFunnels"/><GoalScopePicker label="Módulos" allLabel="Todos os módulos" name="moduleKeys" options={modules} all={allModules} values={moduleKeys}
      onChange={(all, keys) => { setAllModules(all); setModuleKeys(keys); }} hint="No funil de módulos, soma apenas os itens marcados. Os demais funis selecionados entram integralmente."/></>}
  </>;
}
