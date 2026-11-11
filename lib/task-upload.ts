export const TASK_FILE_BYTES = 25 * 1024 * 1024;

export function taskUploadBatches<T extends { name: string; size: number }>(files: T[]) {
  if (files.length > 10) throw new Error('É permitido enviar no máximo 10 arquivos por vez.');
  if (files.some(file => file.size <= 0 || file.size > TASK_FILE_BYTES))
    throw new Error('Selecione arquivos não vazios, com no máximo 25 MB cada.');
  const batches: T[][] = []; let bytes = 0;
  for (const file of files) {
    if (!batches.length || bytes + file.size > TASK_FILE_BYTES) { batches.push([]); bytes = 0; }
    batches[batches.length - 1].push(file); bytes += file.size;
  }
  return batches;
}

export async function sendTaskFiles(taskId: string, files: File[], commentId?: string, onUploaded?: (files: File[]) => void) {
  for (const batch of taskUploadBatches(files)) {
    const form = new FormData(); batch.forEach(file => form.append('files', file));
    const query = new URLSearchParams({ taskId }); if (commentId) query.set('commentId', commentId);
    const response = await fetch(`/api/task-files?${query}`, { method: 'POST', body: form });
    const raw = await response.text();
    if (!response.ok) {
      let detail = ''; try { detail = JSON.parse(raw)?.detail ?? ''; } catch { /* Gateways can return HTML. */ }
      throw new Error(response.status === 413 ? 'O envio excedeu o limite do servidor. Cada anexo pode possuir até 25 MB.'
        : detail || 'Não foi possível enviar os anexos. Os arquivos pendentes continuam selecionados.');
    }
    onUploaded?.(batch);
  }
}
