"use client";

import { useEffect } from "react";
import { endKanbanDrag, suppressKanbanClick } from "@/lib/kanban-drag";

export default function KanbanDragSupport() {
  useEffect(()=>{
    const end=()=>endKanbanDrag();
    const click=(event:MouseEvent)=>{
      if(suppressKanbanClick() && (event.target as HTMLElement | null)?.closest('[draggable="true"]')){
        event.preventDefault();event.stopImmediatePropagation();
      }
    };
    document.addEventListener("dragend",end);
    document.addEventListener("click",click,true);
    window.addEventListener("blur",end);
    return()=>{document.removeEventListener("dragend",end);document.removeEventListener("click",click,true);window.removeEventListener("blur",end);end();};
  },[]);
  return null;
}
