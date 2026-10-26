export type ReminderLinkRecord = { id: string; description: string; status?: string };
export type ReminderLinkContext = { module: string; entityId?: string; clientId?: string; title?: string };
export type ScheduledReminder = {
  id: string; title: string; remindAt: string; nextAlertAt?: string;
  sourceModule?: string; sourceEntityId?: string; sourceClientId?: string; sourceTitle?: string;
};
const normalized = (value?: string) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");

export function brasiliaDateKey(value: string | number | Date = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export const reminderScheduledAt = (reminder: { remindAt: string; nextAlertAt?: string }) => reminder.nextAlertAt || reminder.remindAt;
export function isReminderForToday(reminder: { remindAt: string; nextAlertAt?: string }, now = Date.now()) {
  const day = brasiliaDateKey(reminderScheduledAt(reminder));
  return Boolean(day) && day === brasiliaDateKey(now);
}

export function pendingLinkedReminders(records: ReminderLinkRecord[], context: ReminderLinkContext): ScheduledReminder[] {
  return records.flatMap((record) => {
    try {
      const detail = JSON.parse(record.description) as ScheduledReminder & { kind?: string; seenAt?: string; confirmedAt?: string };
      if (detail.kind !== "systemReminder" || detail.seenAt || detail.confirmedAt || /cancel|conclu|finaliz|encerr/i.test(record.status ?? "")) return [];
      if (detail.sourceModule && detail.sourceModule !== context.module) return [];
      // Um vínculo explícito com outro card nunca pode cair no fallback por cliente ou título.
      const matches = detail.sourceEntityId ? detail.sourceEntityId === context.entityId
        : detail.sourceModule === context.module && (detail.sourceClientId && context.clientId
          ? normalized(detail.sourceClientId) === normalized(context.clientId)
          : Boolean(context.title && normalized(detail.sourceTitle) === normalized(context.title)));
      if (!matches || !brasiliaDateKey(reminderScheduledAt(detail))) return [];
      return [{ ...detail, id: record.id }];
    } catch { return []; }
  }).sort((a, b) => Date.parse(reminderScheduledAt(a)) - Date.parse(reminderScheduledAt(b)));
}
