type Deadline = { slaDueAt?: string | null; dueAt?: string | null };
export function taskDeliveryDate(task: Deadline) {
  return (
    [task.slaDueAt, task.dueAt].find(
      (value) => value && Number.isFinite(Date.parse(value)),
    ) ?? null
  );
}

type PriorityHistory = {
  id: string;
  eventType: string;
  actorName: string;
  createdAt: string;
};
export function taskPriorityRequest<T extends PriorityHistory>(
  history: readonly T[],
) {
  return history
    .filter((entry) => entry.eventType === "priority_requested")
    .sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        b.id.localeCompare(a.id),
    )[0];
}

export function canRequestTaskPriority(
  canEdit: boolean,
  isCoordinator: boolean,
  collaborator?: {
    active: boolean;
    coordinatorDepartmentIds: readonly string[];
  },
) {
  return (
    canEdit &&
    Boolean(
      collaborator?.active &&
      (isCoordinator || collaborator.coordinatorDepartmentIds.length > 0),
    )
  );
}
