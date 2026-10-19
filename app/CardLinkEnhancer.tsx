"use client";

import { useEffect } from "react";

type RecordLink = { id: string; title: string; protocol?: string; module?: string };
const selectors = ["[data-reminder-entity-id]", ".task-card", ".task-table-row:not(.head)", ".suggestion-kanban-cards>article", ".suggestion-table tbody tr", ".commercial-lead-card", ".retention-lead-card", ".cs-client-card", ".enterprise-card", ".cancellation-card", ".marketing-card", ".service-list>article", ".development-card-shell", ".development-list-row", ".journey-card", ".goal-card", ".referral-card-shell", ".service-request-column>div>article", ".waiting-queue-row", ".direct-sales-row:not(.direct-sales-head)"];

export function cardShareUrl(module: string, id: string) {
  const url = new URL(window.location.origin);
  const current = new URL(window.location.href);
  url.searchParams.set("mod", module);
  for (const key of ["commercialFlow", "csFlow"]) {
    const value = current.searchParams.get(key);
    if (value && ((key === "csFlow" && module === "cs") || (key === "commercialFlow" && module === "commercial"))) url.searchParams.set(key, value);
  }
  url.searchParams.set("card", id);
  if (module === "tasks") url.searchParams.set("task", id);
  if (module === "ti") url.searchParams.set("subtask", id);
  return url.toString();
}

export default function CardLinkEnhancer({ module, records }: { module: string; records: RecordLink[] }) {
  const signature = JSON.stringify(records.map(({id,title,protocol,module}) => [id,title,protocol,module]));
  useEffect(() => {
    const currentRecords: RecordLink[] = (JSON.parse(signature) as Array<[string,string,string?,string?]>).map(([id,title,protocol,module]) => ({id,title,protocol,module}));
    let frame = 0;
    const enhance = () => {
      const cards = document.querySelectorAll<HTMLElement>(selectors.join(","));
      cards.forEach(card => {
        if (card.querySelector(".card-copy-link")) return;
        const text = card.innerText;
        const directId = card.dataset.reminderEntityId;
        let record = currentRecords.find(record => record.id === directId);
        if (!record) {
          const matches = currentRecords.filter(record => (record.module === module || !record.module) && ((record.protocol && text.includes(record.protocol)) || (record.title && Array.from(card.querySelectorAll("h2,h3,strong,b,.task-card-title")).some(element => element.textContent?.trim() === record.title))));
          if (matches.length === 1) record = matches[0];
        }
        if (!record) return;
        card.dataset.sharedCardId = record.id;
        card.dataset.reminderEntityId = record.id;
        const id = record.id;
        const destinationModule = record.module || module;
        const button = document.createElement("button");
        button.type = "button"; button.className = "card-copy-link";
        button.textContent = "Copiar link"; button.title = "Copiar link deste card";
        button.addEventListener("click", async event => {
          event.preventDefault(); event.stopPropagation();
          try { await navigator.clipboard.writeText(cardShareUrl(destinationModule, id)); button.textContent = "Link copiado"; }
          catch { button.textContent = "Não foi possível copiar"; }
        });
        // Table rows need a cell host to keep their table semantics intact.
        const host = card.tagName === "TR" ? card.querySelector("td") : card;
        host?.prepend(button);
      });
      const requested = new URLSearchParams(window.location.search).get("card");
      if (requested) {
        const card = Array.from(cards).find(card => card.dataset.sharedCardId === requested);
        if (card && !card.classList.contains("shared-card-highlight")) {
          card.classList.add("shared-card-highlight"); card.scrollIntoView({block:"center"});
        }
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; enhance(); }); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {childList:true, subtree:true});
    enhance();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); document.querySelectorAll("[data-shared-card-id] .card-copy-link").forEach(button => button.remove()); };
  }, [module, signature]);
  return null;
}
