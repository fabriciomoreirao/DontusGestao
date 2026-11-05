export type CancellationResponsibility = {
  seller?: string;
  csOwner?: string;
  reversalOwner?: string;
};

// Older cards stored their only assignee in WorkItem.owner.
export const cancellationReversalOwner = (detail: CancellationResponsibility, owner = "") =>
  detail.reversalOwner?.trim() || owner.trim();

export const cancellationRoles = [
  { key: "seller", label: "Vendedor", title: "Vendedores", description: "Pessoa que fechou a venda." },
  { key: "csOwner", label: "Responsável CS", title: "Responsáveis de CS", description: "Pessoa que acompanha o cliente." },
  { key: "reversalOwner", label: "Responsável pela reversão", title: "Responsáveis pela reversão", description: "Pessoa que conduz as tratativas e responde pelo card." },
] as const;

export type CancellationRole = typeof cancellationRoles[number]["key"];
type Record = { item: { owner: string; status: string }; detail: CancellationResponsibility & { monthlyValueCents: number } };

export function cancellationResponsibleName(record: Record, role: CancellationRole) {
  return (role === "reversalOwner" ? cancellationReversalOwner(record.detail, record.item.owner) : record.detail[role]?.trim()) || "Não informado";
}

export function cancellationResponsibilitySummary(records: Record[], role: CancellationRole) {
  const groups = new Map<string, { name: string; total: number; converted: number; lost: number; progress: number; recoveredMrr: number; lostMrr: number }>();
  for (const record of records) {
    const name = cancellationResponsibleName(record, role);
    const row = groups.get(name) ?? { name, total: 0, converted: 0, lost: 0, progress: 0, recoveredMrr: 0, lostMrr: 0 };
    row.total++;
    if (record.item.status === "Convertido") { row.converted++; row.recoveredMrr += record.detail.monthlyValueCents; }
    else if (record.item.status === "Não convertido") { row.lost++; row.lostMrr += record.detail.monthlyValueCents; }
    else row.progress++;
    groups.set(name, row);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
}
