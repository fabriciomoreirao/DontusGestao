"use client";

import { useEffect, useRef } from "react";
import "./crm-scrollbar.css";

export default function CrmScrollbar() {
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeBoard = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const scrollbar = scrollbarRef.current;
    const track = trackRef.current;
    const workspace = document.getElementById("workspace-content");
    if (!scrollbar || !track || !workspace) return;

    let boards: HTMLElement[] = [];
    let frame = 0;

    const update = () => {
      frame = 0;
      const target = boards.find((board) => {
        const bounds = board.getBoundingClientRect();
        return (
          board.clientWidth > 0 &&
          board.scrollWidth > board.clientWidth + 1 &&
          bounds.top < window.innerHeight - 18 &&
          bounds.bottom > window.innerHeight &&
          bounds.right > 0 &&
          bounds.left < window.innerWidth
        );
      });
      if (activeBoard.current !== (target ?? null)) {
        activeBoard.current?.classList.remove("crm-native-scrollbar-active");
        target?.classList.add("crm-native-scrollbar-active");
        activeBoard.current = target ?? null;
      }
      scrollbar.hidden = !target;
      if (!target) return;

      const bounds = target.getBoundingClientRect();
      const left = Math.max(0, bounds.left);
      const right = Math.min(window.innerWidth, bounds.right);
      scrollbar.style.left = left + "px";
      scrollbar.style.width = Math.max(0, right - left) + "px";
      track.style.width =
        target.scrollWidth - target.clientWidth + scrollbar.clientWidth + "px";
      if (Math.abs(scrollbar.scrollLeft - target.scrollLeft) > 1) {
        scrollbar.scrollLeft = target.scrollLeft;
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    const bindBoards = () => {
      const next = Array.from(
        workspace.querySelectorAll<HTMLElement>(".commercial-board"),
      );
      if (
        next.length !== boards.length ||
        next.some((board, index) => board !== boards[index])
      ) {
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
    document.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      mutations.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      activeBoard.current?.classList.remove("crm-native-scrollbar-active");
      activeBoard.current = null;
    };
  }, []);

  return (
    <div
      ref={scrollbarRef}
      className="crm-native-scrollbar"
      role="region"
      aria-label="Rolagem horizontal do CRM"
      tabIndex={0}
      hidden
      onScroll={(event) => {
        const board = activeBoard.current;
        if (
          board &&
          Math.abs(board.scrollLeft - event.currentTarget.scrollLeft) > 1
        ) {
          board.scrollLeft = event.currentTarget.scrollLeft;
        }
      }}
    >
      <div ref={trackRef} className="crm-native-scrollbar-track" />
    </div>
  );
}
