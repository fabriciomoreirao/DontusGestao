"use client";

import { BellRing, Clock3 } from "lucide-react";
import { crmInactivityDays, isClosedCrmLead, type CrmActivityItem, type CrmActivityLead, type CrmActivityStage } from "@/lib/crm-activity";
import { reminderScheduledAt, type ScheduledReminder } from "@/lib/reminder-links";

export default function CrmCardActivity({ item, lead, stages, reminders, now }: {
  item: CrmActivityItem; lead: CrmActivityLead | null; stages: CrmActivityStage[]; reminders: ScheduledReminder[]; now: number;
}) {
  const days = crmInactivityDays(item, lead, stages, now);
  const closed = isClosedCrmLead(item, lead, stages);
  const reminderLabel = reminders.length ? `${reminders.length} lembrete(s) pendente(s). Próximo: ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(reminderScheduledAt(reminders[0])))}` : "";
  return <span className="crm-card-activity">
    <span className={`crm-card-inactivity ${days >= 5 ? "alert" : ""} ${closed ? "closed" : ""}`} title={closed ? "Finalizado: contagem de dias sem interação encerrada." : "Tempo desde o último comentário ou follow-up de contato."}>
      <Clock3 size={13} /><strong>{days} dia(s)</strong> sem interação
    </span>
    {reminders.length > 0 && <span className="crm-card-reminder" role="img" aria-label={reminderLabel} title={reminderLabel}><BellRing size={14} />{reminders.length > 1 && <b>{reminders.length}</b>}</span>}
  </span>;
}
