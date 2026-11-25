export function agendaStatusBlocksTime(status: string): boolean {
  const name = status
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  return name === "agendado" || name === "concluido";
}
