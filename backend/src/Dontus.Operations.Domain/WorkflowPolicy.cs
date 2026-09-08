namespace Dontus.Operations.Domain;

public static class WorkflowPolicy
{
    private static readonly IReadOnlyDictionary<string, string[]> States =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["commercial"] = ["NovoLead", "EmContato", "Qualificado", "Diagnostico", "Apresentacao", "Negociacao", "Ganho", "Perdido", "Cancelado"],
            ["cs"] = ["PendenteAgendamento", "Agendado", "TreinamentoRealizado", "EmAcompanhamento", "AguardandoCliente", "Pausado", "EmValidacaoFinal", "Finalizado", "TransferidoSuporte", "Cancelado"],
            ["lia"] = ["AguardandoKickoff", "KickoffAgendado", "ConfiguracaoInicial", "EmTesteCliente", "EmAjustes", "AguardandoAprovacao", "GoLiveAgendado", "EmProducaoAssistida", "ImplantacaoPrincipalConcluida", "ConfigurandoCRC", "Concluida", "BloqueadaPeloCliente", "Pausada", "Cancelada"],
            ["marketing"] = ["Recebida", "Em planejamento", "Em produção", "Em revisão", "Concluída"],
            ["referrals"] = ["Em acompanhamento", "Em conferência", "Aprovado", "Reprovado"],
            ["support"] = ["Novo", "EmAtendimento", "AguardandoCliente", "AguardandoSetor", "AguardandoTI", "Resolvido", "Encerrado", "Reaberto"],
            ["ti"] = ["Nova", "EmTriagem", "AguardandoInformacoes", "Classificada", "EmAnaliseTecnica", "Priorizada", "EmDesenvolvimento", "EmCorrecao", "EmTeste", "AguardandoHomologacao", "AguardandoTerceiro", "AguardandoDeploy", "Concluida", "Cancelada", "Reprovada", "Reaberta"],
            ["finance"] = ["Rascunho", "PendenteAprovacao", "Aprovada", "Agendada", "Paga", "Vencida", "Cancelada", "Estornada"],
            ["procurement"] = ["Solicitada", "EmCotacao", "PendenteAprovacao", "Aprovada", "Comprada", "Recebida", "Patrimoniada", "Cancelada"],
            ["diary"] = ["Pendente", "Em andamento", "Concluída", "Cancelada"],
            ["work"] = ["A fazer", "Em andamento", "Bloqueada", "Concluída", "Cancelada"],
        };

    private static readonly HashSet<string> Terminal =
    [
        "Ganho", "Perdido", "Cancelado", "Finalizado", "TransferidoSuporte",
        "Concluida", "Encerrado", "Paga", "Estornada", "Recebida",
        "Patrimoniada", "Concluída",
    ];

    public static string InitialStatus(string module) =>
        States.TryGetValue(module, out var states) ? states[0] : "Novo";

    public static IReadOnlyCollection<string> AllowedNext(string module, string current)
    {
        if (!States.TryGetValue(module, out var states) ||
            (Terminal.Contains(current) && !(module.Equals("marketing", StringComparison.OrdinalIgnoreCase) && current == "Recebida")))
            return [];

        // Compatibilidade com solicitações de Marketing criadas antes da
        // introdução do fluxo próprio, quando o status padrão era "Novo".
        if (module.Equals("marketing", StringComparison.OrdinalIgnoreCase) && current == "Novo")
            return states;

        var index = Array.IndexOf(states, current);
        if (index < 0)
            return [];

        var result = new List<string>();
        if (index + 1 < states.Length)
            result.Add(states[index + 1]);

        // Os testes da LIA podem ser aprovados diretamente quando não há
        // correções pendentes. "EmAjustes" continua disponível pelo avanço
        // sequencial, mas não deve bloquear o envio para conferência.
        if (module.Equals("lia", StringComparison.OrdinalIgnoreCase) && current == "EmTesteCliente")
            result.Add("AguardandoAprovacao");

        switch (module.ToLowerInvariant())
        {
            case "commercial": result.AddRange(["Perdido", "Cancelado"]); break;
            case "cs": result.AddRange(["AguardandoCliente", "Pausado", "Cancelado"]); break;
            case "lia": result.AddRange(["BloqueadaPeloCliente", "Pausada", "Cancelada"]); break;
            case "support": result.AddRange(["AguardandoCliente", "AguardandoSetor", "AguardandoTI"]); break;
            case "ti": result.AddRange(["AguardandoInformacoes", "AguardandoTerceiro", "Cancelada", "Reprovada"]); break;
            case "finance": result.Add("Cancelada"); break;
        }

        return result.Where(x => !string.Equals(x, current, StringComparison.Ordinal)).Distinct().ToArray();
    }

    public static bool CanTransition(string module, string current, string next) =>
        string.Equals(current, next, StringComparison.Ordinal) || AllowedNext(module, current).Contains(next);

    public static bool RequiresExplicitConfirmation(string module, string nextStatus) =>
        module switch
        {
            "cs" => nextStatus is "Finalizado" or "TransferidoSuporte",
            "lia" => nextStatus is "GoLiveAgendado" or "Concluida",
            "finance" => nextStatus is "Aprovada" or "Paga" or "Estornada",
            _ => false,
        };
}
