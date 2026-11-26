"use client";

import { useEffect, useRef } from "react";

export default function KanbanScrollRail({ selector }: { selector: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeBoard = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    const input = inputRef.current;
    const workspace = document.getElementById("workspace-content");
    if (!rail || !input || !workspace) return;
    let boards: HTMLElement[] = [];
    let frame = 0;

    const update = () => {
      frame = 0;
      const viewport = window.innerHeight;
      let target: HTMLElement | null = null;
      for (const board of boards) {
        const bounds = board.getBoundingClientRect();
        if (
          board.clientWidth > 0 &&
          board.scrollWidth - board.clientWidth > 1 &&
          bounds.top < viewport - 48 &&
          bounds.bottom > viewport &&
          bounds.right > 0 &&
          bounds.left < window.innerWidth
        ) {
          target = board;
          break;
        }
      }
      if (activeBoard.current !== target) {
        activeBoard.current?.classList.remove("has-scroll-rail");
        target?.classList.add("has-scroll-rail");
        activeBoard.current = target;
      }
      rail.hidden = !target;
      if (!target) return;

      const bounds = target.getBoundingClientRect();
      const left = Math.max(0, bounds.left);
      const right = Math.min(window.innerWidth, bounds.right);
      rail.style.left = left + "px";
      rail.style.width = Math.max(0, right - left) + "px";
      input.max = String(target.scrollWidth - target.clientWidth);
      input.value = String(Math.round(target.scrollLeft));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    const bindBoards = () => {
      const next = Array.from(workspace.querySelectorAll<HTMLElement>(selector));
      if (next.length !== boards.length || next.some((board, index) => board !== boards[index])) {
        resize.disconnect();
        resize.observe(workspace);
        next.forEach((board) => resize.observe(board));
        boards = next;
      }
      schedule();
    };
    const mutations = new MutationObserver(bindBoards);
    mutations.observe(workspace, { childList: true, subtree: true });
    bindBoards();
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      mutations.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      activeBoard.current?.classList.remove("has-scroll-rail");
      activeBoard.current = null;
      rail.hidden = true;
    };
  }, [selector]);

  return (
    <div ref={railRef} className="kanban-scroll-rail" hidden>
      <input
        ref={inputRef}
        type="range"
        aria-label="Rolar o quadro na horizontal"
        min={0}
        max={0}
        step={1}
        defaultValue={0}
        onInput={(event) =>
          activeBoard.current?.scrollTo({
            left: Number(event.currentTarget.value),
            behavior: "instant",
          })
        }
      />
    </div>
  );
}
