"use client";

import { dateRangeBounds } from "@/lib/date-range";
import "./date-range-filter.css";

export default function DateRangeFilter({
  value,
  onChange,
  label = "Período",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  const { from, to } = dateRangeBounds(value);
  const change = (start: string, end: string) =>
    onChange(start || end ? `${start}..${end}` : "");
  return (
    <div
      className={`date-range-filter ${className}`}
      role="group"
      aria-label={label}
    >
      <label>
        <span>De</span>
        <input
          type="date"
          aria-label={`${label}: de`}
          value={from}
          onChange={(event) => {
            const next = event.target.value;
            change(next, to && next > to ? next : to);
          }}
        />
      </label>
      <label>
        <span>Até</span>
        <input
          type="date"
          aria-label={`${label}: até`}
          value={to}
          onChange={(event) => {
            const next = event.target.value;
            change(from && next && from > next ? next : from, next);
          }}
        />
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={!from && !to}
        onClick={() => onChange("")}
        aria-label={`Limpar ${label.toLocaleLowerCase("pt-BR")}`}
      >
        Limpar
      </button>
    </div>
  );
}
