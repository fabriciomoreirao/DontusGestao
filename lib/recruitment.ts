export const DEFAULT_RECRUITMENT_STAGES = [
  "Currículo",
  "Triagem",
  "Entrevista",
  "Teste",
  "Aprovado",
  "Reprovado",
];

const names = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean),
        ),
      ]
    : [];

// Keep received applications visible even after the configured columns change.
export function recruitmentStages(
  configured: unknown,
  fallback: unknown = DEFAULT_RECRUITMENT_STAGES,
  candidateStatuses: unknown = [],
): string[] {
  const stages = names(configured);
  const defaults = names(fallback);
  return [
    ...new Set([
      ...(stages.length
        ? stages
        : defaults.length
          ? defaults
          : DEFAULT_RECRUITMENT_STAGES),
      ...names(candidateStatuses),
    ]),
  ];
}
