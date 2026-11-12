using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Dontus.Operations.Infrastructure;

public static class CommercialStageTimeline
{
    public static string Normalize(string? description, string? previous = null, DateTimeOffset? createdAt = null, DateTimeOffset? at = null)
    {
        try
        {
            if (JsonNode.Parse(description ?? "") is not JsonObject next || Text(next, "kind") != "commercialLead") return description ?? "";
            var before = string.IsNullOrWhiteSpace(previous) ? null : JsonNode.Parse(previous) as JsonObject;
            var changed = before is null || Text(before, "stage") != Text(next, "stage") || Text(before, "funnel") != Text(next, "funnel");
            var entered = changed ? at ?? DateTimeOffset.UtcNow : Date(Text(before!, "stageEnteredAt")) ?? LegacyDate(before!, createdAt ?? at ?? DateTimeOffset.UtcNow);
            next["stageEnteredAt"] = entered.ToString("O");
            return next.ToJsonString();
        }
        catch (JsonException) { return description ?? ""; }
    }

    private static DateTimeOffset LegacyDate(JsonObject value, DateTimeOffset fallback)
    {
        var dates = new List<DateTimeOffset?> { Date(Text(value, "wonAt")), Date(Text(value, "closedAt")) };
        foreach (var follow in (value["follows"] as JsonArray ?? []).OfType<JsonObject>())
            if (Text(follow, "type").Contains("movimenta", StringComparison.OrdinalIgnoreCase)
                || Text(follow, "type").Contains("resultado comercial", StringComparison.OrdinalIgnoreCase)
                || Text(follow, "type").StartsWith("Transfer", StringComparison.OrdinalIgnoreCase)) dates.Add(Date(Text(follow, "createdAt")));
        return dates.Where(date => date.HasValue).Select(date => date!.Value).DefaultIfEmpty(fallback).Max();
    }
    private static DateTimeOffset? Date(string value) => DateTimeOffset.TryParse(value.Length == 10 ? value + "T00:00:00-03:00" : value,
        CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date) ? date : null;
    private static string Text(JsonObject value, string key) => value[key] is JsonValue scalar && scalar.TryGetValue<string>(out var text) ? text ?? "" : "";
}
