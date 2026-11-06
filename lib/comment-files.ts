export type CommentFile = { name: string; type: string; dataUrl: string; size: number };
const marker = '[[DONTUS_FILES:';
export function splitComment(value: string): { text: string; files: CommentFile[] } {
  const index = value.lastIndexOf(marker);
  if (index < 0 || !value.endsWith(']]')) return { text: value, files: [] };
  try {
    const files: unknown = JSON.parse(value.slice(index + marker.length, -2));
    if (!Array.isArray(files) || !files.every(file => file && typeof file.name === 'string' && typeof file.type === 'string' && typeof file.size === 'number' && typeof file.dataUrl === 'string' && /^data:[^;,]*;base64,[A-Za-z0-9+/=]*$/.test(file.dataUrl))) return { text: value, files: [] };
    return { text: value.slice(0,index).replace(/\n\n$/, ''), files };
  } catch { return { text: value, files: [] }; }
}
export function joinComment(text: string, files: CommentFile[]) { return files.length ? `${text}\n\n${marker}${JSON.stringify(files)}]]` : text; }
export async function readCommentFiles(files: File[]): Promise<CommentFile[]> {
  if (files.some(file=>file.size<=0 || file.size>5*1024*1024)) throw new Error('Selecione arquivos não vazios de até 5 MB cada.');
  return Promise.all(files.map(file=>new Promise<CommentFile>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error(`Não foi possível ler ${file.name}.`));reader.onload=()=>resolve({name:file.name,type:file.type||'application/octet-stream',size:file.size,dataUrl:String(reader.result)});reader.readAsDataURL(file)})));
}
