type AgendaTypeOption = { id: string; name: string; active: boolean };
const clean = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Scheduling uses the whole active catalog, regardless of the source tool or stage. */
export function selectableAgendaTypes<T extends AgendaTypeOption>(
  types: readonly T[],
): T[] {
  return types
    .filter((type) => type.active)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function journeyAgendaType(
  module: string,
  description?: string,
): "Reunião" | "Treinamento" | undefined {
  if (module !== "cs" && module !== "lia") return undefined;
  let detail: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(description || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      detail = parsed;
  } catch {
    /* Older cards may contain plain text. */
  }
  if (detail.kind === "enterpriseNetwork") return "Reunião";
  const stage = clean(detail.phase || detail.stage || detail.status);
  return /onboarding|activation|aguardandokickoff|kickoffagendado/.test(stage)
    ? "Treinamento"
    : "Reunião";
}

export function findJourneyAgendaType(
  types: AgendaTypeOption[],
  requiredName: string,
) {
  return types.find(
    (type) =>
      type.active && clean(type.name).trim() === clean(requiredName).trim(),
  );
}
