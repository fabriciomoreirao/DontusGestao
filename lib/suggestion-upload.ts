export function validateSuggestionFiles(files: { size: number }[]) {
  if (files.length > 10) throw new Error("Selecione no máximo 10 arquivos por vez.");
  if (files.some(file => !Number.isSafeInteger(file.size) || file.size <= 0)) throw new Error("Selecione arquivos não vazios.");
}

export async function sendSuggestionFiles(id: string, files: File[], onUploaded?: (files: File[]) => void) {
  validateSuggestionFiles(files);
  // An acknowledged file is removed from the pending selection before a retry.
  for (const file of files) {
    const form = new FormData(); form.append("files", file);
    const response = await fetch(`/api/suggestion-files?suggestionId=${encodeURIComponent(id)}`, { method: "POST", body: form });
    const raw = await response.text();
    if (!response.ok) {
      let detail = ""; try { detail = JSON.parse(raw)?.detail ?? ""; } catch { /* Gateways may send HTML. */ }
      throw new Error(response.status === 413 ? "O servidor de acesso recusou o tamanho do envio. Tente novamente." : detail || "Não foi possível enviar o anexo. Tente novamente com os arquivos pendentes.");
    }
    onUploaded?.([file]);
  }
}
