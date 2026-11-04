const date = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric",month:"2-digit",day:"2-digit" });
const time = new Intl.DateTimeFormat("pt-BR", { timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric" });

export function chatSeenLabel(value?: string | null, now = Date.now(), seenByCount = 0, recipientCount = 0) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const seen = new Date(value);
  const day = date.format(seen);
  const when = day === date.format(new Date(now)) ? "hoje" : day === date.format(new Date(now - 86_400_000)) ? "ontem" : fullDate.format(seen);
  const prefix = recipientCount > 1 && seenByCount < recipientCount ? `Visualizado por ${seenByCount} de ${recipientCount}` : "Visualizado";
  return `${prefix}: ${when} às ${time.format(seen)}`;
}

export const CHAT_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "👏", "🎉"];
