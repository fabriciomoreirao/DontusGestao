"use client";

import { useEffect } from "react";
import CrmScrollbar from "./CrmScrollbar";
import { endKanbanDrag, suppressKanbanClick } from "@/lib/kanban-drag";
import { kanbanHorizontalScrollSpeed, kanbanScrollSpeed } from "@/lib/kanban-autoscroll";

const dragSurfaces = [
  ".commercial-board",
  ".task-board",
  ".kanban",
  ".suggestion-kanban",
  ".development-board",
  ".recruitment-board",
  ".standard-kanban",
  ".service-request-board",
  ".cancellation-board",
  ".notes-grid",
].join(", ");

const scrollSurfaces = dragSurfaces + ", .journey-board, .hr-board, .waiting-queue-columns";

function verticalScrollContainer(surface: HTMLElement) {
  for (let parent = surface.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.scrollingElement) break;
    const { overflowY } = getComputedStyle(parent);
    if (/^(auto|scroll|overlay)$/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
  }
  return null;
}

export default function KanbanDragSupport() {
  useEffect(() => {
    let board: HTMLElement | null = null,
      verticalContainer: HTMLElement | null = null,
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
        const horizontalSpeed = kanbanHorizontalScrollSpeed(
          x,
          rect.left,
          rect.right,
          window.innerWidth,
        );
        if (horizontalSpeed) {
          board.scrollBy({ left: horizontalSpeed * factor, behavior: "instant" });
        }
        const viewport = verticalContainer?.getBoundingClientRect();
        const verticalSpeed = kanbanScrollSpeed(
          y,
          Math.max(0, viewport?.top ?? 0),
          Math.min(window.innerHeight, viewport?.bottom ?? window.innerHeight),
          48,
        );
        if (verticalSpeed) {
          (verticalContainer ?? window).scrollBy({
            top: verticalSpeed * factor,
            behavior: "instant",
          });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const start = (event: DragEvent) => {
      board =
        (event.target as Element | null)?.closest<HTMLElement>(
          dragSurfaces,
        ) ?? null;
      verticalContainer = board ? verticalScrollContainer(board) : null;
      board?.classList.add("is-drag-scrolling");
    };
    const over = (event: DragEvent) => {
      if (!board) return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const pause = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };
    const end = () => {
      pause();
      board?.classList.remove("is-drag-scrolling");
      board = null;
      verticalContainer = null;
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
    document.addEventListener("dragover", over, true);
    document.addEventListener("click", click, true);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("dragstart", start);
      document.removeEventListener("dragover", over, true);
      document.removeEventListener("drop", end);
      document.removeEventListener("dragend", end);
      document.removeEventListener("click", click, true);
      window.removeEventListener("blur", pause);
      end();
    };
  }, []);
  return <CrmScrollbar />;
}
