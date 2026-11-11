type Task = {assigneeUserId:string|null;currentDepartmentId:string};
type Collaborator = {id:string;active:boolean;departmentIds:readonly string[]};

export function taskAssignmentAccess(task:Task,collaborator:Collaborator|undefined) {
  const active=Boolean(collaborator?.active);
  return {
    canClaim:active && !task.assigneeUserId && Boolean(collaborator?.departmentIds.includes(task.currentDepartmentId)),
    canTransfer:active && Boolean(collaborator && task.assigneeUserId===collaborator.id),
  };
}
