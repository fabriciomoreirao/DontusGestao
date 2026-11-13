export const liaFileLimits = { perFile: 50 * 1024 * 1024, total: 100 * 1024 * 1024, perQuestion: 10, count: 20 };

export function moveLiaQuestion<T>(questions: readonly T[], index: number, direction: -1 | 1): T[] {
  const next = [...questions];
  const target = index + direction;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function validateLiaFiles(groups: readonly { questionId: string; files: readonly { name: string; size: number }[] }[]): string {
  const files = groups.flatMap(group => group.files);
  if (groups.some(group => group.files.length > liaFileLimits.perQuestion)) return "Selecione até 10 arquivos por pergunta.";
  if (files.length > liaFileLimits.count) return "Selecione até 20 arquivos no formulário.";
  if (files.some(file => file.size === 0)) return "Há um arquivo vazio. Selecione um arquivo preenchido.";
  if (files.some(file => file.size > liaFileLimits.perFile)) return "Cada arquivo pode ter até 50 MB.";
  if (files.reduce((sum, file) => sum + file.size, 0) > liaFileLimits.total) return "Os arquivos do formulário devem somar no máximo 100 MB.";
  return "";
}
