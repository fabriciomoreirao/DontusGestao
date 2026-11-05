"use client";

import { Clock3, Plus, Trash2 } from "lucide-react";

export type EmployeeAccessSchedule = { enabled: boolean; windows: Array<{ day: number; start: string; end: string }> };
const days = [{ day: 1, name: "Segunda-feira" }, { day: 2, name: "Terça-feira" }, { day: 3, name: "Quarta-feira" }, { day: 4, name: "Quinta-feira" }, { day: 5, name: "Sexta-feira" }, { day: 6, name: "Sábado" }, { day: 0, name: "Domingo" }];

export function accessScheduleError(schedule: EmployeeAccessSchedule) {
  if (!schedule.enabled) return "";
  if (!schedule.windows.length) return "Selecione ao menos um dia e horário de acesso.";
  if (schedule.windows.length > 28) return "Cadastre até 28 intervalos de expediente.";
  return schedule.windows.some(window => !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.end) || window.start === window.end)
    ? "Informe horários de início e fim válidos e diferentes." : "";
}

export default function EmployeeAccessScheduleEditor({ value, onChange, disabled }: { value: EmployeeAccessSchedule; onChange: (value: EmployeeAccessSchedule) => void; disabled: boolean }) {
  return <fieldset className="employee-access-schedule wide" disabled={disabled}>
    <legend><Clock3 size={17} /> Restrição de horário de acesso</legend>
    <label className="checkbox-label"><input type="checkbox" checked={value.enabled} onChange={event => onChange({ enabled: event.target.checked, windows: value.windows.length ? value.windows : days.filter(day => day.day <= 5 && day.day >= 1).map(({ day }) => ({ day, start: "08:00", end: "18:00" })) })} />Permitir acesso somente no expediente configurado</label>
    <p>Horário de Brasília (America/Sao_Paulo). Fora dos intervalos, o login e as sessões abertas são bloqueados.</p>
    {value.enabled && <div className="employee-access-week">{days.map(({ day, name }) => {
      const windows = value.windows.map((window, index) => ({ ...window, index })).filter(window => window.day === day);
      return <div className="employee-access-day" key={day}>
        <label className="checkbox-label"><input type="checkbox" checked={windows.length > 0} onChange={event => onChange({ ...value, windows: event.target.checked ? [...value.windows, { day, start: "08:00", end: "18:00" }] : value.windows.filter(window => window.day !== day) })} />{name}</label>
        <div>{windows.length === 0 ? <small>Acesso não permitido</small> : windows.map(window => <div className="employee-access-window" key={window.index}>
          <label>Início<input aria-label={`Início ${name} ${window.index + 1}`} type="time" required value={window.start} onChange={event => onChange({ ...value, windows: value.windows.map((entry, index) => index === window.index ? { ...entry, start: event.target.value } : entry) })} /></label>
          <span>até</span><label>Fim<input aria-label={`Fim ${name} ${window.index + 1}`} type="time" required value={window.end} onChange={event => onChange({ ...value, windows: value.windows.map((entry, index) => index === window.index ? { ...entry, end: event.target.value } : entry) })} /></label>
          <button className="icon-button" type="button" aria-label={`Remover intervalo de ${name}`} onClick={() => onChange({ ...value, windows: value.windows.filter((_, index) => index !== window.index) })}><Trash2 size={15} /></button>
          {window.end < window.start && <small className="overnight-note">Termina no dia seguinte</small>}
        </div>)}</div>
        {windows.length > 0 && <button className="secondary-button" type="button" disabled={value.windows.length >= 28} onClick={() => onChange({ ...value, windows: [...value.windows, { day, start: "13:00", end: "18:00" }] })}><Plus size={14} /> Intervalo</button>}
      </div>;
    })}</div>}
  </fieldset>;
}
