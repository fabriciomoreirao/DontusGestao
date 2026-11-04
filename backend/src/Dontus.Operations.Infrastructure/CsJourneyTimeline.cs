using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

internal static class CsJourneyTimeline
{
    public static string Normalize(string description, WorkItem? previous = null)
    {
        JsonObject? detail;
        try { detail = JsonNode.Parse(description) as JsonObject; }
        catch (JsonException) { return description; }
        if (detail?["kind"]?.ToString() != "csJourney") return description;
        JsonObject? old = null;
        try { old = previous is null ? null : JsonNode.Parse(previous.Description) as JsonObject; } catch (JsonException) { }
        var now = DateTimeOffset.UtcNow;
        var start = detail["startDate"]?.ToString();
        if (!string.IsNullOrWhiteSpace(start))
        {
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(now, "America/Sao_Paulo").DateTime);
            if (!DateOnly.TryParseExact(start, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) || date > today)
                throw new DomainException("Informe uma data de início válida, igual ou anterior a hoje.");
        }
        var field = detail["phase"]?.ToString() switch { "onboarding" or "activation" => "onboardingStartedAt", "tracking" or "evolution" => "trackingStartedAt", _ => null };
        if (field is not null && string.IsNullOrWhiteSpace(detail[field]?.ToString()))
        {
            var unchangedPhase = old?["phase"]?.ToString() == detail["phase"]?.ToString();
            detail[field] = !string.IsNullOrWhiteSpace(start) ? $"{start}T00:00:00-03:00"
                : old?[field]?.ToString() ?? (unchangedPhase ? previous!.CreatedAt : now).ToString("O");
        }
        if (detail["phase"]?.ToString() is "finished" or "unsuccessful" or "cancelled" or "cancelledWithoutTraining"
            && string.IsNullOrWhiteSpace(detail["conferenceConfirmedAt"]?.ToString()) && string.IsNullOrWhiteSpace(detail["cancellationResolvedAt"]?.ToString()))
            detail["conferenceConfirmedAt"] = (previous is not null && old?["phase"]?.ToString() == detail["phase"]?.ToString() ? previous.UpdatedAt : now).ToString("O");
        return detail.ToJsonString();
    }
}
