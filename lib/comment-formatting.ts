export function toggleCommentBold(text: string, selectionStart: number, selectionEnd: number) {
  let start = Math.max(0, Math.min(text.length, selectionStart));
  let end = Math.max(start, Math.min(text.length, selectionEnd));
  if (text.slice(start, end).startsWith("**") && text.slice(start, end).endsWith("**") && end - start >= 4) {
    return { text: text.slice(0,start) + text.slice(start+2,end-2) + text.slice(end), start, end:end-4 };
  }
  if (start >= 2 && text.slice(start-2,start) === "**" && text.slice(end,end+2) === "**") {
    return { text:text.slice(0,start-2)+text.slice(start,end)+text.slice(end+2), start:start-2, end:end-2 };
  }
  if (end > start) {
    const selected=text.slice(start,end);
    start += selected.match(/^\s*/)?.[0].length ?? 0;
    end -= selected.match(/\s*$/)?.[0].length ?? 0;
    if (end < start) end = start;
  }
  return { text:text.slice(0,start)+"**"+text.slice(start,end)+"**"+text.slice(end), start:start+2, end:end+2 };
}

export function commentFormatting(text: string): { text:string; bold:boolean }[] {
  const result:{text:string;bold:boolean}[]=[];
  const pattern=/\*\*(\S(?:[\s\S]*?\S)?)\*\*/g;
  let cursor=0;
  for(const match of text.matchAll(pattern)){
    if(match.index!>cursor)result.push({text:text.slice(cursor,match.index),bold:false});
    result.push({text:match[1],bold:true});cursor=match.index!+match[0].length;
  }
  if(cursor<text.length)result.push({text:text.slice(cursor),bold:false});
  return result;
}
