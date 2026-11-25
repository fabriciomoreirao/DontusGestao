export default function SaleObservation({
  text,
  compact = false,
}: {
  text?: string;
  compact?: boolean;
}) {
  if (!text?.trim()) return null;
  return (
    <span
      className={`sale-observation${compact ? " compact" : ""}`}
      role="note"
    >
      <strong>Observação da venda</strong>
      <span title={compact ? text : undefined}>{text}</span>
    </span>
  );
}
