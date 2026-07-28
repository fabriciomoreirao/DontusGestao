export const MODULES = {
  dashboard: { label: "Visão geral", short: "Geral" },
  customers: { label: "Customer 360", short: "Clientes" },
  commercial: { label: "Comercial", short: "Comercial" },
  cs: { label: "Sucesso do Cliente", short: "CS" },
  lia: { label: "Implantação LIA", short: "LIA" },
  support: { label: "Suporte", short: "Suporte" },
  ti: { label: "Demandas de TI", short: "TI" },
  finance: { label: "Financeiro", short: "Financeiro" },
  procurement: { label: "Compras e patrimônio", short: "Compras" },
  approvals: { label: "Aprovações", short: "Aprovações" },
  work: { label: "Agenda e tarefas", short: "Agenda" },
  reporting: { label: "Indicadores", short: "Indicadores" },
  admin: { label: "Administração", short: "Admin" },
} as const;

export type ModuleKey = keyof typeof MODULES;

export const STATE_MACHINES: Record<string, readonly string[]> = {
  commercial: [
    "NovoLead", "EmContato", "Qualificado", "Diagnostico", "Apresentacao",
    "Negociacao", "Ganho", "Perdido", "Cancelado",
  ],
  cs: [
    "PendenteAgendamento", "Agendado", "TreinamentoRealizado", "EmAcompanhamento",
    "AguardandoCliente", "Pausado", "EmValidacaoFinal", "Finalizado",
    "TransferidoSuporte", "Cancelado",
  ],
  lia: [
    "AguardandoKickoff", "KickoffAgendado", "ConfiguracaoInicial", "EmTesteCliente",
    "EmAjustes", "AguardandoAprovacao", "GoLiveAgendado", "EmProducaoAssistida",
    "ImplantacaoPrincipalConcluida", "ConfigurandoCRC", "Concluida",
    "BloqueadaPeloCliente", "Pausada", "Cancelada",
  ],
  support: [
    "Novo", "EmAtendimento", "AguardandoCliente", "AguardandoSetor",
    "AguardandoTI", "Resolvido", "Encerrado", "Reaberto",
  ],
  ti: [
    "Nova", "EmTriagem", "AguardandoInformacoes", "Classificada",
    "EmAnaliseTecnica", "Priorizada", "EmDesenvolvimento", "EmCorrecao",
    "EmTeste", "AguardandoHomologacao", "AguardandoTerceiro",
    "AguardandoDeploy", "Concluida", "Cancelada", "Reprovada", "Reaberta",
  ],
  finance: [
    "Rascunho", "PendenteAprovacao", "Aprovada", "Agendada", "Paga",
    "Vencida", "Cancelada", "Estornada",
  ],
  procurement: [
    "Solicitada", "EmCotacao", "PendenteAprovacao", "Aprovada",
    "Comprada", "Recebida", "Patrimoniada", "Cancelada",
  ],
  work: ["A fazer", "Em andamento", "Bloqueada", "Concluída", "Cancelada"],
};

const TERMINAL = new Set([
  "Ganho", "Perdido", "Cancelado", "Finalizado", "TransferidoSuporte",
  "Concluida", "Encerrado", "Paga", "Estornada", "Recebida", "Patrimoniada",
  "Concluída",
]);

export function initialStatus(module: string): string {
  return STATE_MACHINES[module]?.[0] ?? "Novo";
}

export function allowedNextStatuses(module: string, current: string): string[] {
  const states = STATE_MACHINES[module] ?? [];
  const index = states.indexOf(current);
  if (index < 0 || TERMINAL.has(current)) return [];
  const next = states[index + 1];
  const options = next ? [next] : [];
  if (module === "commercial") options.push("Perdido", "Cancelado");
  if (module === "cs") options.push("AguardandoCliente", "Pausado", "Cancelado");
  if (module === "lia") options.push("BloqueadaPeloCliente", "Pausada", "Cancelada");
  if (module === "support") options.push("AguardandoCliente", "AguardandoSetor", "AguardandoTI");
  if (module === "ti") options.push("AguardandoInformacoes", "AguardandoTerceiro", "Cancelada", "Reprovada");
  if (module === "finance") options.push("Cancelada");
  return [...new Set(options)].filter((status) => status !== current);
}

export function canTransition(module: string, current: string, next: string): boolean {
  if (current === next) return true;
  return allowedNextStatuses(module, current).includes(next);
}

export const RECORD_TYPES: Record<string, string[]> = {
  commercial: ["Lead", "Oportunidade", "Handoff", "Pós-venda"],
  cs: ["Onboarding", "Treinamento", "Configuração", "Conta estratégica"],
  lia: ["Projeto LIA", "Teste", "Ajuste", "CRC"],
  support: ["Ticket", "Configuração", "Sugestão", "Treinamento extra"],
  ti: ["Bug", "Incidente crítico", "Validação técnica", "Melhoria", "Novo desenvolvimento"],
  finance: ["Estorno", "Conta a pagar", "Boleto", "Cobrança", "DRE", "Nota de parceiro"],
  procurement: ["Compra", "Suprimento", "Ativo", "Manutenção"],
  work: ["Tarefa", "Compromisso", "Lembrete"],
};

export const PRIORITIES = ["P0", "P1", "P2", "P3", "P4"] as const;
