"use client";
import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import useDialogFocus from "./useDialogFocus";
export default function WhatsAppDialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); useDialogFocus(ref, onClose);
  return <div className="wa-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} className={`wa-dialog ${wide ? "wa-dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Fechar"><X size={22}/></button></header><div className="wa-dialog-body">{children}</div></div></div>;
}
