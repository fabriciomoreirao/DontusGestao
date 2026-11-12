"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";

export default function LiaFinalConference({ busy, canReview, onDecision }: { busy: boolean; canReview: boolean; onDecision: (approved: boolean, reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  return <section className="journey-action-card lia-final-conference"><h3>Conferência final</h3><p>{canReview ? "Confira a implantação antes de concluir. Em caso de reprovação, descreva o que deve ser corrigido." : "Aguardando a decisão da coordenação da LIA."}</p>
    {canReview && <><label>Motivo da reprovação<textarea rows={3} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="Descreva os ajustes necessários para devolver ao acompanhamento final." /></label><div className="button-row"><button type="button" className="danger-button" disabled={busy || !reason.trim()} onClick={() => void onDecision(false, reason.trim())}><X size={16} />Reprovar e devolver</button><button type="button" className="primary-button" disabled={busy} onClick={() => void onDecision(true, "")}><Check size={16} />Aprovar e concluir</button></div></>}
  </section>;
}
