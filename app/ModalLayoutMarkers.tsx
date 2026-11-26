"use client";

import { useEffect } from "react";

// Structural layout belongs to the modal, rather than expensive :has() selectors
// that the browser reevaluates across every message while a textarea changes.
export default function ModalLayoutMarkers() {
  useEffect(() => {
    const update = (modal: Element) =>
      modal.classList.toggle(
        "form-grid-layout",
        Boolean(modal.querySelector(".form-grid")),
      );
    document.querySelectorAll(".modal,.modal-shell").forEach(update);
    const observer = new MutationObserver((records) => {
      const modals = new Set<Element>();
      for (const record of records) {
        if (record.target instanceof Element) {
          const owner = record.target.closest(".modal,.modal-shell");
          if (owner) modals.add(owner);
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(".modal,.modal-shell")) modals.add(node);
          node
            .querySelectorAll(".modal,.modal-shell")
            .forEach((modal) => modals.add(modal));
        }
      }
      modals.forEach(update);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
