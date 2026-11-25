import { FileText } from "lucide-react";

export default function UnitObservation({ text }: { text: string }) {
  return (
    <section className="enterprise-notes">
      <header>
        <FileText size={19} />
        <strong>Nota / Observação</strong>
      </header>
      <dl>
        {(text || "Sem observações para esta unidade.")
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line, index) => {
            const field = line.match(/^([^:\n]{1,60}):\s*(.*)$/);
            return field && !/^https?$/i.test(field[1]) ? (
              <div key={index}>
                <dt>{field[1]}</dt>
                <dd>{field[2] || "Não informado"}</dd>
              </div>
            ) : (
              <div className="enterprise-note-paragraph" key={index}>
                <dd>{line}</dd>
              </div>
            );
          })}
      </dl>
    </section>
  );
}
