using System.Text.Json.Nodes;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

internal static class CsJourneyFeaturesPolicy
{
    private static readonly string[] Fields = ["featuresBase", "featuresActive", "featuresPlus"];

    public static string PreserveAndValidate(WorkItem previous, string? description)
    {
        if (previous.Module != "cs") return description ?? previous.Description;
        var old = FollowupValidationPolicy.Detail(previous.Description);
        if (old["kind"]?.ToString() != "csJourney") return description ?? previous.Description;
        if (description is null) return previous.Description;
        var next = FollowupValidationPolicy.Detail(description);
        if (next["kind"]?.ToString() != "csJourney")
            throw new DomainException("Preserve os dados do acompanhamento.", 403);

        var canEdit = old["phase"]?.ToString() is "tracking" or "evolution" or "conference";
        foreach (var field in Fields)
        {
            var saved = old[field] ?? (field == "featuresActive" ? old["features"] : null);
            var supplied = next.ContainsKey(field) || field == "featuresActive" && next.ContainsKey("features");
            var value = next.ContainsKey(field) ? next[field] : field == "featuresActive" ? next["features"] : null;
            if (!supplied)
            {
                if (saved is not null) next[field] = saved.DeepClone();
                continue;
            }
            if (value is null) throw new DomainException("Informe uma lista válida de features.");
            var selected = ReadFeatures(value);
            if (!canEdit && !selected.SetEquals(ReadFeatures(saved)))
                throw new DomainException("As features só podem ser alteradas em Acompanhamento ou Conferência.", 403);
            next[field] = value.DeepClone();
        }
        // Canonicalize the legacy selection so later phase updates keep the same values.
        next.Remove("features");
        return next.ToJsonString();
    }

    private static HashSet<string> ReadFeatures(JsonNode? value)
    {
        if (value is null) return [];
        if (value is not JsonArray array || array.Any(entry => entry is not JsonValue json || !json.TryGetValue<string>(out _)))
            throw new DomainException("Informe uma lista válida de features.");
        return array.Select(entry => entry!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
    }
}
