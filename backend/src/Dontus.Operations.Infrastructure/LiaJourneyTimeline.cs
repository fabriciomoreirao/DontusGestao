using System.Text.Json.Nodes;
using Dontus.Operations.Domain;
using static Dontus.Operations.Infrastructure.CommissionConfirmationService;

namespace Dontus.Operations.Infrastructure;

internal static class LiaJourneyTimeline
{
    internal const int FinalFollowupDays = 3;
    internal static readonly string[] Stages = ["AguardandoKickoff", "KickoffAgendado", "ConfiguracaoInicial", "EmTesteCliente", "EmAjustes", "AguardandoAprovacao", "GoLiveAgendado", "EmProducaoAssistida", "ImplantacaoPrincipalConcluida", "ConfigurandoCRC", "AcompanhamentoFinal", "Concluida"];
    internal static string Normalize(string description, string status, WorkItem? previous = null)
    {
        var detail = Detail(description);
        if (Text(detail, "kind") != "liaJourney") return description;
        var old = Detail(previous?.Description ?? "{}");
        var now = DateTimeOffset.UtcNow;
        foreach (var key in new[] { "configurationStartedAt", "clientTestsStartedAt", "releaseStartedAt", "finalFollowupStartedAt", "completedAt" })
        {
            detail.Remove(key);
            if (old[key] is not null) detail[key] = old[key]!.DeepClone();
        }
        var field = status switch {
            "ConfiguracaoInicial" => "configurationStartedAt", "EmTesteCliente" or "EmAjustes" => "clientTestsStartedAt",
            "AguardandoAprovacao" or "GoLiveAgendado" or "EmProducaoAssistida" or "ImplantacaoPrincipalConcluida" or "ConfigurandoCRC" => "releaseStartedAt",
            "AcompanhamentoFinal" => "finalFollowupStartedAt", "Concluida" => "completedAt", _ => null };
        if (field is not null && string.IsNullOrWhiteSpace(Text(detail, field))) detail[field] = now.ToString("O");
        // Re-entering final follow-up starts a fresh observation period.
        if (status == "AcompanhamentoFinal" && previous?.Status != status) detail["finalFollowupStartedAt"] = now.ToString("O");
        if (status == "Concluida" && previous?.Status != status)
        {
            var started = CsJourneyTimeline.ReadDate(Text(old, "finalFollowupStartedAt"));
            var today = CsJourneyTimeline.ReadDate(now.ToString("O"))!.Value;
            if (previous?.Status != "AcompanhamentoFinal" || started is null || today.DayNumber - started.Value.DayNumber < FinalFollowupDays)
                throw new DomainException($"Mantenha o cliente em Acompanhamento Final por pelo menos {FinalFollowupDays} dias antes de concluir.", 409);
        }
        return detail.ToJsonString();
    }

    internal static JsonObject CommissionStages(JsonObject detail, string status)
    {
        var index = Array.IndexOf(Stages, status);
        string Progress(string key, int start, int end) => Text(detail, key) is { Length: > 0 } stamp ? stamp : index > end ? "Concluída" : index >= start ? "Em andamento" : "Pendente";
        return new JsonObject { ["configuration"] = Progress("configurationStartedAt", 2, 2), ["tests"] = Progress("clientTestsStartedAt", 3, 4),
            ["release"] = Progress("releaseStartedAt", 5, 9), ["current"] = status switch { "Concluida" => "Concluído", "AcompanhamentoFinal" => "Acompanhamento", _ => index is 0 or 1 ? "Onboarding" : index == 2 ? "Configuração Inicial" : index is 3 or 4 ? "Testes do Cliente" : index >= 5 ? "Liberação" : status } };
    }
}
