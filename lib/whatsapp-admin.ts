import type { ChatModuleData } from "@/app/ChatModule";
import { ACCESS_DENIED_EVENT } from "./access-session.ts";
import { whatsappNumber } from "./whatsapp.ts";
export type WaVariable = { key: string; example: string };
export type WaButton = {
  type: "QUICK_REPLY" | "URL";
  text: string;
  url: string;
};
export type WaTemplate = {
  id: string;
  numberId: string;
  name: string;
  language: string;
  purpose: string;
  category: string;
  body: string;
  headerType: string;
  mediaUrl: string;
  variables: WaVariable[];
  buttons: WaButton[];
  status: string;
  rejectionReason: string;
  syncedAt: string | null;
};
export type WaCampaign = {
  id: string;
  numberId: string;
  name: string;
  category: string;
  status: string;
  scheduledAt: string | null;
  finishedAt: string | null;
  templateCount: number;
  recipientCount: number;
  total: number;
  successful: number;
  errors: number;
};
export type WaRecipient = {
  name: string;
  phone: string;
  values?: Record<string, string>;
};
export type WaState = {
  module: ChatModuleData;
  templates: WaTemplate[];
  campaigns: WaCampaign[];
  suiteConfigured: boolean;
  numbers: {
    id: string;
    suiteStatus: string;
    suiteClinicId: string;
    suiteDontusId: string;
    suiteBase: string;
  }[];
  contacts: { id: string; name: string; phone: string }[];
  customers: { id: string; name: string; phone: string }[];
};
export const WA_PURPOSES: Record<string, { key: string; label: string }[]> = {
  Agendamento: [
    { key: "paciente", label: "Paciente" },
    { key: "profissional", label: "Profissional" },
    { key: "clinica", label: "Clínica" },
    { key: "horario", label: "Horário do agendamento" },
    { key: "data", label: "Data do agendamento" },
    { key: "link_confirmacao", label: "Link de confirmação" },
  ],
  "Pós-atendimento": [
    { key: "paciente", label: "Paciente" },
    { key: "profissional", label: "Profissional" },
    { key: "clinica", label: "Clínica" },
  ],
  Campanhas: [
    { key: "clinica", label: "Clínica" },
    { key: "destinatario", label: "Nome do destinatário" },
  ],
  Assinaturas: [
    { key: "paciente", label: "Paciente" },
    { key: "clinica", label: "Clínica" },
    { key: "link_assinatura", label: "Link de assinatura" },
  ],
  "Boas-vindas": [
    { key: "paciente", label: "Paciente" },
    { key: "clinica", label: "Clínica" },
  ],
  "Carteirinha digital": [
    { key: "paciente", label: "Paciente" },
    { key: "clinica", label: "Clínica" },
    { key: "link_carteirinha", label: "Link da carteirinha" },
  ],
  Indicação: [
    { key: "paciente", label: "Paciente" },
    { key: "clinica", label: "Clínica" },
    { key: "link_indicacao", label: "Link de indicação" },
  ],
  Voucher: [
    { key: "paciente", label: "Paciente" },
    { key: "clinica", label: "Clínica" },
    { key: "valor", label: "Valor" },
    { key: "validade", label: "Validade" },
  ],
  Cobrança: [
    { key: "paciente", label: "Paciente" },
    { key: "clinica", label: "Clínica" },
    { key: "valor", label: "Valor" },
    { key: "vencimento", label: "Data de vencimento" },
    { key: "parcela", label: "Parcela" },
    { key: "link_pagamento", label: "Link para pagamento" },
  ],
};
export async function waApi<T = { id?: string }>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/whatsapp/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body instanceof FormData
        ? undefined
        : { "content-type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
      : AbortSignal.timeout(120000),
  });
  const result = await response.json();
  if (response.status === 401)
    window.dispatchEvent(new Event(ACCESS_DENIED_EVENT));
  if (!response.ok)
    throw new Error(
      result.detail || "Não foi possível concluir a operação WhatsApp.",
    );
  return result;
}
export const waDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value))
    : "Não informado";
export const waStatus = (status: string) =>
  ({
    APPROVED: "Aprovado",
    PENDING: "Em análise",
    REJECTED: "Rejeitado",
    PAUSED: "Pausado",
    DISABLED: "Desativado",
    IN_APPEAL: "Em recurso",
  })[status] || status;
export function normalizeRecipients(rows: WaRecipient[]) {
  const seen = new Set<string>();
  const recipients: WaRecipient[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const row of rows) {
    const phone = whatsappNumber(String(row.phone || ""));
    const name = String(row.name || "").trim();
    if (!phone || !name) {
      invalid++;
      continue;
    }
    if (seen.has(phone)) {
      duplicates++;
      continue;
    }
    seen.add(phone);
    recipients.push({ ...row, name, phone });
  }
  return { recipients, invalid, duplicates };
}
export function templatePreview(body: string, values: string[]) {
  return body.replace(
    /\{\{(\d+)\}\}/g,
    (match, index) => values[Number(index) - 1] || match,
  );
}
export function restoreCampaignRecipients(
  deliveries: {
    name: string;
    phone: string;
    templateId: string;
    parametersJson: string;
  }[],
  templates: WaTemplate[],
): WaRecipient[] {
  const recipients = new Map<string, WaRecipient>();
  for (const delivery of deliveries) {
    const recipient = recipients.get(delivery.phone) || {
      name: delivery.name,
      phone: delivery.phone,
      values: {},
    };
    const parameters: string[] = JSON.parse(delivery.parametersJson);
    for (const [index, variable] of (
      templates.find((t) => t.id === delivery.templateId)?.variables || []
    ).entries())
      recipient.values![variable.key] = parameters[index] || "";
    recipients.set(delivery.phone, recipient);
  }
  return [...recipients.values()];
}
