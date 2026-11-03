export type DepartmentQueueMode = "conventional" | "linked";

export function belongsToWaitingQueueDepartment(person: {departmentId?:string|null;departmentIds?:string[];departmentName?:string;departmentNames?:string[]}, department:{departmentId:string;departmentName:string}) {
  const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("pt-BR");
  const names=[person.departmentName??"",...(person.departmentNames??[])];
  return Boolean(department.departmentId && [person.departmentId,...(person.departmentIds??[])].includes(department.departmentId))
    || Boolean(department.departmentName.trim() && names.some(name=>normalize(name)===normalize(department.departmentName)));
}

const QUEUE_MODE_MARKER = /\s*\[\[dontus-fila:(conventional|linked)\]\]\s*/gi;

export function departmentQueueMode(description?: string | null): DepartmentQueueMode {
  const match = String(description ?? "").match(/\[\[dontus-fila:(conventional|linked)\]\]/i);
  return match?.[1]?.toLowerCase() === "linked" ? "linked" : "conventional";
}

export function cleanDepartmentDescription(description?: string | null) {
  return String(description ?? "").replace(QUEUE_MODE_MARKER, " ").replace(/\s{2,}/g, " ").trim();
}

export function serializeDepartmentDescription(description: string, mode: DepartmentQueueMode) {
  const clean = cleanDepartmentDescription(description);
  return `${clean}${clean ? " " : ""}[[dontus-fila:${mode}]]`;
}
