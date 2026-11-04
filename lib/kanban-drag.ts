const MIME = "application/x-dontus-kanban";
type DragTransfer = Pick<DataTransfer,"getData"|"setData"|"effectAllowed">;
let active: {type:string;id:string} | null = null;
let suppressClickUntil = 0;

export function beginKanbanDrag(event: {dataTransfer:DragTransfer}, type:string, id:string) {
  active={type:type.toLowerCase(),id};
  event.dataTransfer.effectAllowed="move";
  event.dataTransfer.setData(type,id);
  event.dataTransfer.setData("text/plain",id);
  event.dataTransfer.setData(MIME,JSON.stringify(active));
}

export function readKanbanDrop(event: {dataTransfer:Pick<DataTransfer,"getData">;preventDefault:()=>void}, type:string) {
  event.preventDefault();
  const expected=type.toLowerCase();
  try {
    const raw=event.dataTransfer.getData(MIME);
    if(raw){const payload=JSON.parse(raw);return payload.type===expected&&typeof payload.id==="string"?payload.id:"";}
  } catch { return ""; }
  return event.dataTransfer.getData(type)|| (active?.type===expected?active.id:"") || event.dataTransfer.getData("text/plain");
}

export function endKanbanDrag(now=Date.now()) {
  if(active)suppressClickUntil=now+250;
  active=null;
}

export const suppressKanbanClick = (now=Date.now()) => now<suppressClickUntil;
