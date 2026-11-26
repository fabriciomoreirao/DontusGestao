import { uploadWorkspaceFile } from "./workspace-upload.ts";
export type CommentFile = {
  name: string;
  type: string;
  dataUrl: string;
  size: number;
};
const marker = "[[DONTUS_FILES:";
export function splitComment(value: string): {
  text: string;
  files: CommentFile[];
} {
  const index = value.lastIndexOf(marker);
  if (index < 0 || !value.endsWith("]]")) return { text: value, files: [] };
  try {
    const files: unknown = JSON.parse(value.slice(index + marker.length, -2));
    if (
      !Array.isArray(files) ||
      !files.every((file) => {
        if (
          !file ||
          typeof file.name !== "string" ||
          typeof file.type !== "string" ||
          !Number.isSafeInteger(file.size) ||
          file.size <= 0 ||
          typeof file.dataUrl !== "string"
        )
          return false;
        if (/^\/api\/workspace-files\/[0-9a-f-]{36}$/.test(file.dataUrl))
          return true;
        const data = /^data:[^;,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(
          file.dataUrl,
        )?.[1];
        return (
          data !== undefined &&
          data.length % 4 === 0 &&
          (data.length / 4) * 3 -
            (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0) ===
            file.size
        );
      })
    )
      return { text: value, files: [] };
    return { text: value.slice(0, index).replace(/\n\n$/, ""), files };
  } catch {
    return { text: value, files: [] };
  }
}
export function joinComment(text: string, files: CommentFile[]) {
  return files.length ? `${text}\n\n${marker}${JSON.stringify(files)}]]` : text;
}
export async function readCommentFiles(files: File[]): Promise<CommentFile[]> {
  if (files.length > 10) throw new Error("Use até 10 arquivos por comentário.");
  const uploaded: CommentFile[] = [];
  for (const file of files) {
    const result = await uploadWorkspaceFile(file);
    uploaded.push({
      name: result.name,
      type: result.type,
      size: result.size,
      dataUrl: result.url,
    });
  }
  return uploaded;
}
