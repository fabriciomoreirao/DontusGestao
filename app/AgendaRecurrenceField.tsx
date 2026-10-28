"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useId, useState } from "react";

export type AgendaRecurrenceSelection = { mode: string; dates: string[] };

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateLabel = (date: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(`${date}T12:00:00`));
const modes = [["none", "Não repetir"], ["week", "Semana atual"], ["month", "Mês inteiro"], ["businessDays", "Dias úteis do mês"], ["dates", "Escolher datas"]];

export default function AgendaRecurrenceField({ value, onChange, referenceDate }: {
  value: AgendaRecurrenceSelection;
  onChange: (value: AgendaRecurrenceSelection) => void;
  referenceDate?: string;
}) {
  const hintId = useId();
  const [month, setMonth] = useState(() => dateKey(new Date()).slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const days = new Date(year, monthNumber, 0).getDate();
  const shiftMonth = (direction: number) => setMonth(dateKey(new Date(year, monthNumber - 1 + direction, 1)).slice(0, 7));
  const toggleDate = (date: string) => onChange({ ...value, dates: value.dates.includes(date) ? value.dates.filter((entry) => entry !== date) : [...value.dates, date].sort() });

  return <fieldset className="wide agenda-recurrence">
    <legend>Repetir compromisso</legend>
    <div className="agenda-recurrence-modes">{modes.map(([mode, label]) => <label key={mode}>
      <input type="radio" name="recurrence" value={mode} checked={value.mode === mode} onChange={() => {
        onChange({ ...value, mode });
        if (mode === "dates") setMonth((referenceDate || dateKey(new Date())).slice(0, 7));
      }} /><span>{label}</span>
    </label>)}</div>
    {value.mode === "dates" && <section className="agenda-recurrence-dates" aria-label="Datas de repetição" aria-describedby={hintId}>
      <p id={hintId}>O compromisso será criado na data principal e também nas datas marcadas, com o mesmo horário. Selecione até 100 datas.</p>
      <div className="agenda-recurrence-calendar">
        <header>
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mês anterior para repetição"><ChevronLeft size={17} /></button>
          <label><span className="sr-only">Mês das datas de repetição</span><input type="month" value={month} required onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} /></label>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Próximo mês para repetição"><ChevronRight size={17} /></button>
        </header>
        <div className="agenda-recurrence-weekdays" aria-hidden="true">{["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="agenda-recurrence-day-grid">
          {Array.from({ length: firstDay }, (_, index) => <span key={`empty-${index}`} />)}
          {Array.from({ length: days }, (_, index) => {
            const date = dateKey(new Date(year, monthNumber - 1, index + 1));
            const selected = value.dates.includes(date);
            return <button type="button" key={date} aria-label={dateLabel(date)} aria-pressed={selected} className={selected ? "selected" : ""} disabled={!selected && value.dates.length >= 100} onClick={() => toggleDate(date)}>{index + 1}</button>;
          })}
        </div>
      </div>
      <div className="agenda-recurrence-selected" aria-live="polite">
        <strong>{value.dates.length ? `${value.dates.length} data(s) selecionada(s)` : "Marque pelo menos uma data no calendário."}</strong>
        {value.dates.map((date) => <button type="button" key={date} onClick={() => toggleDate(date)} aria-label={`Remover ${dateLabel(date)}`}>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR")}<X size={13} /></button>)}
      </div>
    </section>}
  </fieldset>;
}
