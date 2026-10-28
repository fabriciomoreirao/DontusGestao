"use client";

import { useEffect, useRef, type RefObject } from "react";

export default function useDialogFocus<T extends HTMLElement>(ref: RefObject<T | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(element => element.getClientRects().length > 0 && !element.closest("[inert],[aria-hidden=true]"));
    const first = dialog.querySelector<HTMLElement>('[autofocus],input:not([type="file"]):not([type="checkbox"]):not([type="hidden"]):not(:disabled),select:not(:disabled),textarea:not(:disabled)') ?? controls()[0] ?? dialog;
    const frame = requestAnimationFrame(() => first.focus({ preventScroll: true }));
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const elements = controls();const firstControl = elements[0];const lastControl = elements[elements.length - 1];
      if (!firstControl) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === firstControl || document.activeElement === dialog)) { event.preventDefault(); lastControl.focus(); }
      else if (!event.shiftKey && document.activeElement === lastControl) { event.preventDefault(); firstControl.focus(); }
    };
    dialog.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(frame);dialog.removeEventListener("keydown", key);if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [ref]);
}
