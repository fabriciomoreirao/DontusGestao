// Texto curto de uma mensagem do chat interno, usado na lista de conversas e nos alertas.
// Fica em lib/ para o OperationsApp usar a mesma regra sem importar o InternalChatModule,
// que é carregado sob demanda.

export type PollView = {
  question: string;
  options: { text: string; voterUserIds: string[] }[];
};

type PreviewMessage = {
  type: string;
  body: string;
  fileName?: string | null;
  deletedAt?: string | null;
};

// Uma enquete é gravada como JSON no corpo da mensagem.
export function parsePoll(raw: string): PollView | null {
  try {
    const value = JSON.parse(raw) as { question?: unknown; options?: unknown };
    if (typeof value.question !== "string" || !Array.isArray(value.options))
      return null;
    const options = value.options.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const option = entry as { text?: unknown; voterUserIds?: unknown };
      return typeof option.text === "string"
        ? [
            {
              text: option.text,
              voterUserIds: Array.isArray(option.voterUserIds)
                ? option.voterUserIds.filter(
                    (id): id is string => typeof id === "string",
                  )
                : [],
            },
          ]
        : [];
    });
    return options.length >= 2 ? { question: value.question, options } : null;
  } catch {
    return null;
  }
}

const pollLabel = (body: string) =>
  `Enquete: ${parsePoll(body)?.question ?? "pergunta"}`;

// Linha da lista de conversas.
export function messagePreview(message: PreviewMessage) {
  if (message.deletedAt) return "Mensagem excluída";
  if (message.type === "sticker") return `${message.body} Figurinha`;
  if (message.type === "image") return "Imagem";
  if (message.type === "video") return "Vídeo";
  if (message.type === "audio") return "Áudio";
  if (message.type === "file") return message.fileName || "Arquivo";
  if (message.type === "poll") return pollLabel(message.body);
  return message.body;
}

// Alerta de mensagem recebida: nunca mostra o conteúdo bruto de um tipo que não é texto.
export function chatAlertText(message: PreviewMessage) {
  if (message.type === "file")
    return `Documento: ${message.fileName || "Arquivo recebido"}`;
  if (message.type === "image") return "Imagem recebida";
  if (message.type === "video") return "Vídeo recebido";
  if (message.type === "audio") return "Áudio recebido";
  if (message.type === "sticker") return `${message.body} Figurinha`;
  if (message.type === "poll") return pollLabel(message.body);
  return message.body || "Nova mensagem recebida";
}
