type Department = { id: string; active: boolean };
type Collaborator = { departmentIds: readonly string[]; coordinatorDepartmentIds: readonly string[] };
type TaskType = { id: string; active: boolean; departmentIds: readonly string[] };
type Status = { id: string; active: boolean; acceptsNewTasks: boolean; isInitial: boolean; isFinal: boolean; departmentId: string | null };

export function availableTaskDepartments<T extends Department>(departments: readonly T[], collaborator: Collaborator | undefined, viewAll: boolean): T[] {
  const memberships = new Set([...(collaborator?.departmentIds ?? []), ...(collaborator?.coordinatorDepartmentIds ?? [])]);
  return departments.filter(department => department.active && (viewAll || memberships.has(department.id)));
}

export function taskTypesForDepartment<T extends TaskType>(types: readonly T[], departmentId: string): T[] {
  return types.filter(type => type.active && type.departmentIds.includes(departmentId));
}

export function initialTaskStatuses<T extends Status>(statuses: readonly T[], departmentIds: readonly string[]): T[] {
  return statuses.filter(status => status.active && status.acceptsNewTasks && !status.isFinal
    && (!status.departmentId || departmentIds.length > 0 && departmentIds.every(id => id === status.departmentId)));
}

export function taskInitialSelection(statuses: readonly Status[], requestedId: string): string {
  if (statuses.some(status => status.id === requestedId)) return requestedId;
  const marked = statuses.filter(status => status.isInitial);
  return marked.length === 1 ? marked[0].id : "";
}
