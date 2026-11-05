import { availableTaskDepartments } from "./task-catalogs.ts";

type Department = { id: string; name: string; active: boolean };
type Collaborator = { email: string; active: boolean; departmentIds: readonly string[]; coordinatorDepartmentIds: readonly string[] };

export function cancellationTaskSector(departments: Department[], collaborators: Collaborator[], user: { email: string; department: string }, viewOtherDepartments: boolean) {
  const collaborator = collaborators.find(person => person.active && person.email.toLocaleLowerCase("pt-BR") === user.email.toLocaleLowerCase("pt-BR"));
  const available = availableTaskDepartments(departments, collaborator, viewOtherDepartments);
  const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  const initial = available.find(sector => normalize(sector.name) === normalize(user.department))
    ?? available.find(sector => collaborator?.departmentIds.includes(sector.id)) ?? available[0];
  return { departmentIds: available.map(sector => sector.id), initialDepartmentId: initial?.id };
}

export function cancellationTaskInitial(detail: { protocol?: string; clientId: string; customerName: string; reason: string; notes: string; requesterPhone: string }, source: { title: string; customer_id: string | null }) {
  return { title: `Cancelamento ${detail.protocol || detail.clientId} · ${detail.customerName || source.title}`,
    description: [detail.reason, detail.notes].filter(Boolean).join("\n\n"),
    customerId: source.customer_id || undefined, customerCode: detail.clientId, clientWhatsApp: detail.requesterPhone };
}
