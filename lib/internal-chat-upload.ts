export const INTERNAL_CHAT_FILE_BYTES = 50 * 1024 * 1024;
export const INTERNAL_CHAT_FILE_COUNT = 10;

export function internalChatUploadBatches<T extends { size: number }>(files: T[]) {
  if (files.length > INTERNAL_CHAT_FILE_COUNT) throw new Error("É permitido enviar no máximo 10 arquivos por vez.");
  if (files.some(file => file.size <= 0 || file.size > INTERNAL_CHAT_FILE_BYTES))
    throw new Error("Arquivos vazios ou maiores que 50 MB não podem ser enviados.");
  const batches: T[][] = [];
  let bytes = 0;
  for (const file of files) {
    if (!batches.length || bytes + file.size > INTERNAL_CHAT_FILE_BYTES) {
      batches.push([]);
      bytes = 0;
    }
    batches[batches.length - 1].push(file);
    bytes += file.size;
  }
  return batches;
}

export async function sendInternalChatFiles(roomId: string, files: File[], onUploaded?: (files: File[]) => void) {
  for (const batch of internalChatUploadBatches(files)) {
    const form = new FormData();
    batch.forEach(file => form.append("files", file));
    const response = await fetch(`/api/internal-chat-files?roomId=${encodeURIComponent(roomId)}`, { method: "POST", body: form });
    if (!response.ok) {
      const raw = await response.text();
      let detail = "";
      try { detail = JSON.parse(raw)?.detail ?? ""; } catch { /* A proxy may return plain text or HTML. */ }
      throw new Error(response.status === 413
        ? "O servidor recusou o tamanho do arquivo. O limite do chat é de 50 MB por arquivo."
        : detail || "Não foi possível enviar o arquivo. Tente novamente.");
    }
    await response.text();
    onUploaded?.(batch);
  }
}
