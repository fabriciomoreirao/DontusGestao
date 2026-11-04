export type ChatReplyMessage = { id: string; senderName: string; type: string; body: string; fileName: string; deletedAt?: string | null };

export function chatReplyPreview(message: ChatReplyMessage) {
  if (message.deletedAt) return "Mensagem excluída";
  if (message.type === "image") return message.fileName ? `Imagem: ${message.fileName}` : "Imagem";
  if (message.type === "video") return message.fileName ? `Vídeo: ${message.fileName}` : "Vídeo";
  if (message.type === "file") return message.fileName || "Arquivo";
  if (message.type === "poll") {
    try { return `Enquete: ${String(JSON.parse(message.body).question || "pergunta").slice(0, 240)}`; }
    catch { return "Enquete"; }
  }
  return message.body.slice(0, 240);
}
