export type DepartmentQueueMode = "conventional" | "linked";

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
