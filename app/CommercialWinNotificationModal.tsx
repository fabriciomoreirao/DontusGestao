"use client";
import { useRef, useState } from "react";
import { Trophy, X } from "lucide-react";
import useDialogFocus from "@/app/useDialogFocus";

export default function CommercialWinNotificationModal({
  customer,
  onCancel,
  onConfirm,
}: {
  customer: string;
  onCancel: () => void;
  onConfirm: (notify: boolean) => void;
}) {
  const [choice, setChoice] = useState<boolean | null>(null);
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, onCancel);
  return (
    <div
      className="modal-backdrop commercial-win-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="commercial-win-title"
        className="modal commercial-win-modal"
        data-detail-enhancement="disabled"
      >
        <header className="modal-head">
          <div>
            <span className="eyebrow">RESULTADO COMERCIAL</span>
            <h2 id="commercial-win-title">
              <Trophy size={22} /> Confirmar ganho
            </h2>
            <p>{customer}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar confirmação de ganho"
            onClick={onCancel}
          >
            <X size={20} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (choice !== null) onConfirm(choice);
          }}
        >
          <fieldset>
            <legend>Notificar esta venda na televisão?</legend>
            <label>
              <input
                type="radio"
                name="notify-sale"
                checked={choice === true}
                onChange={() => setChoice(true)}
              />
              <span>Sim, exibir no painel externo</span>
            </label>
            <label>
              <input
                type="radio"
                name="notify-sale"
                checked={choice === false}
                onChange={() => setChoice(false)}
              />
              <span>Não, registrar sem notificar</span>
            </label>
          </fieldset>
          <p>A venda será registrada normalmente nas duas opções.</p>
          <footer>
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={choice === null}
            >
              Confirmar ganho
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
