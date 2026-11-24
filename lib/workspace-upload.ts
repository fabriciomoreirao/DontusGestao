export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
type UploadContext = { module?: string; sourceId?: string; public?:boolean; onProgress?: (percent: number) => void };
export type UploadedWorkspaceFile = { id:string; name:string; type:string; size:number; url:string };

export async function uploadWorkspaceFile(file: File, context: UploadContext = {}): Promise<UploadedWorkspaceFile> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('Selecione um arquivo não vazio.');
  const module = context.module || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('mod') : null) || 'notes';
  let token='';
  async function request(path: string, init: RequestInit) {
    const headers=new Headers(init.headers);if(token)headers.set('X-Upload-Token',token);
    const response = await fetch(`/api/${context.public?'public-workspace-files':'workspace-files'}${path}`, {...init,headers});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Não foi possível enviar o arquivo. Tente novamente.');
    return data;
  }
  const entry = await request('', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:file.name,contentType:file.type||'application/octet-stream',size:file.size,module,sourceId:context.sourceId}) });
  token=entry.token||'';
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(file.size, offset + UPLOAD_CHUNK_BYTES);
    let sent: {offset:number} | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { sent = await request(`/${entry.id}?offset=${offset}`, {method:'PUT',body:file.slice(offset,end)}); break; }
      catch (error) { if (attempt === 2) throw error; }
    }
    if (!sent || !Number.isSafeInteger(sent.offset) || sent.offset <= offset || sent.offset > file.size) throw new Error('O servidor não confirmou o trecho enviado.');
    offset = sent.offset;
    context.onProgress?.(Math.round(offset/file.size*100));
  }
  return request(`/${entry.id}/complete`, {method:'POST'});
}

export async function workspaceFileUrl(file: File, context?: UploadContext): Promise<string> {
  return (await uploadWorkspaceFile(file, context)).url;
}
