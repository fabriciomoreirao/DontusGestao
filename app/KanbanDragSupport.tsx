"use client";

import { useEffect } from "react";
import { endKanbanDrag, suppressKanbanClick } from "@/lib/kanban-drag";
import { kanbanScrollSpeed } from "@/lib/kanban-autoscroll";

export default function KanbanDragSupport() {
  useEffect(() => {
    let board: HTMLElement | null = null,
      frame = 0,
      x = 0,
      y = 0,
      last = 0;
    const tick = (time: number) => {
      if (!board?.isConnected) {
        frame = 0;
        return;
      }
      const rect = board.getBoundingClientRect();
      const factor = last ? Math.min(2, (time - last) / 16.67) : 1;
      last = time;
      if (y >= rect.top - 40 && y <= rect.bottom + 40) {
        board.scrollLeft +=
          kanbanScrollSpeed(
            x,
            Math.max(0, rect.left),
            Math.min(window.innerWidth, rect.right),
          ) * factor;
        window.scrollBy(
          0,
          kanbanScrollSpeed(y, 0, window.innerHeight, 48) * factor,
        );
      }
      frame = requestAnimationFrame(tick);
    };
    const start = (event: DragEvent) => {
      board =
        (event.target as Element | null)?.closest<HTMLElement>(
          ".commercial-board",
        ) ?? null;
    };
    const over = (event: DragEvent) => {
      if (!board) return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const end = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      board = null;
      endKanbanDrag();
    };
    const click = (event: MouseEvent) => {
      if (
        suppressKanbanClick() &&
        (event.target as HTMLElement | null)?.closest('[draggable="true"]')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("dragend", end);
    document.addEventListener("drop", end);
    document.addEventListener("dragstart", start);
    document.addEventListener("dragover", over);
    document.addEventListener("click", click, true);
    window.addEventListener("blur", end);
    return () => {
      document.removeEventListener("dragstart", start);
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", end);
      document.removeEventListener("dragend", end);
      document.removeEventListener("click", click, true);
      window.removeEventListener("blur", end);
      end();
    };
  }, []);
  return null;
}
