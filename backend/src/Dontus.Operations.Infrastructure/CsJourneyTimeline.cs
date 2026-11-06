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
        if (field == "trackingStartedAt")
        {
            var enteringTracking = previous is not null && old?["phase"]?.ToString() is not ("tracking" or "evolution");
            var editedStart = previous is not null && !enteringTracking && !string.IsNullOrWhiteSpace(start) && start != old?["startDate"]?.ToString();
            if (enteringTracking) detail[field] = now.ToString("O");
            else if (editedStart || previous is null && !string.IsNullOrWhiteSpace(start)) detail[field] = $"{start}T00:00:00-03:00";
        }
        if (field is not null && string.IsNullOrWhiteSpace(detail[field]?.ToString()))
        {
            var unchangedPhase = old?["phase"]?.ToString() == detail["phase"]?.ToString();
            detail[field] = !string.IsNullOrWhiteSpace(start) ? $"{start}T00:00:00-03:00"
                : old?[field]?.ToString() ?? (unchangedPhase ? previous!.CreatedAt : now).ToString("O");
        }
        if(field == "trackingStartedAt")
        {
            var trackingDate=ReadDate(detail[field]?.ToString());
            var today=DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(now,"America/Sao_Paulo").DateTime);
            if(trackingDate is null || trackingDate>today)throw new DomainException("Informe uma data de início do acompanhamento válida, igual ou anterior a hoje.");
        }
        if (detail["phase"]?.ToString() is "finished" or "unsuccessful" or "cancelled" or "cancelledWithoutTraining"
            && string.IsNullOrWhiteSpace(detail["conferenceConfirmedAt"]?.ToString()) && string.IsNullOrWhiteSpace(detail["cancellationResolvedAt"]?.ToString()))
            detail["conferenceConfirmedAt"] = (previous is not null && old?["phase"]?.ToString() == detail["phase"]?.ToString() ? previous.UpdatedAt : now).ToString("O");
        return detail.ToJsonString();
    }

    internal static DateOnly? CommissionDate(string scope, JsonObject detail, DateTimeOffset createdAt)
    {
        if (scope == "lia") return !string.IsNullOrWhiteSpace(detail["startDate"]?.ToString()) ? ReadDate(detail["startDate"]!.ToString())
            : !string.IsNullOrWhiteSpace(detail["startedAt"]?.ToString()) ? ReadDate(detail["startedAt"]!.ToString())
            : null;
        if (detail["phase"]?.ToString() is "validation" or "onboarding" or "activation") return null;
        return !string.IsNullOrWhiteSpace(detail["trackingStartedAt"]?.ToString()) ? ReadDate(detail["trackingStartedAt"]!.ToString())
            : detail["phase"]?.ToString() is "tracking" or "evolution" ? ReadDate(detail["startDate"]?.ToString()) : null;
    }

    private static DateOnly? ReadDate(string? value)
    {
        if (DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) return day;
        return value?.Contains('T') == true && DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var timestamp)
            ? DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(timestamp, "America/Sao_Paulo").DateTime) : null;
    }
}
