"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { matchesReminderFilter, pendingReminders, type ReminderFilterMode, type ReminderLinkContext, type ReminderLinkRecord, type ScheduledReminder } from "@/lib/reminder-links";
import useActivityClock from "@/app/useActivityClock";

const ReminderFilterContext = createContext<{ reminders: ScheduledReminder[]; now: number }>({ reminders: [], now: 0 });

export function ReminderFilterProvider({ records, children }: { records: ReminderLinkRecord[]; children: ReactNode }) {
  const reminders = useMemo(() => pendingReminders(records), [records]);
  const now = useActivityClock();
  const value = useMemo(() => ({ reminders, now }), [reminders, now]);
  return <ReminderFilterContext.Provider value={value}>{children}</ReminderFilterContext.Provider>;
}

export function useReminderFilter(module: string) {
  const { reminders, now } = useContext(ReminderFilterContext);
  const [mode, setMode] = useState<ReminderFilterMode>("all");
  const matches = useCallback((context: Omit<ReminderLinkContext, "module">) => matchesReminderFilter(reminders, { ...context, module }, mode, now), [reminders, module, mode, now]);
  return { mode, matches, control: <ReminderFilterControl value={mode} onChange={setMode} /> };
}

export function ReminderFilterControl({ value, onChange }: { value: ReminderFilterMode; onChange: (value: ReminderFilterMode) => void }) {
  return <label className="reminder-filter-field"><span>Lembretes</span><select aria-label="Filtrar por lembretes" value={value} onChange={(event) => onChange(event.target.value as ReminderFilterMode)}><option value="all">Todos</option><option value="today">Lembretes para hoje</option><option value="scheduled">Com lembrete agendado</option><option value="none">Sem lembrete agendado</option></select></label>;
}
