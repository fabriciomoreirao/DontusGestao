using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

internal static class FollowupValidationPolicy
{
    internal const string Screen = "followupValidation";
    internal static JsonObject Detail(string? value) { try { return JsonNode.Parse(value ?? "{}") as JsonObject ?? new(); } catch (JsonException) { return new(); } }
    internal static bool IsValidation(WorkItem item) => item.Module == "lia" && item.Status == "Validacao"
        || item.Module == "cs" && Detail(item.Description) is var detail && detail["kind"]?.ToString() == "csJourney" && (detail["phase"]?.ToString() ?? "validation") == "validation";
    internal static bool CanEdit(WorkItem item, ActorContext actor) => IsValidation(item) && actor.HasPermission(item.Module, "view") && actor.HasPermission(Screen, "edit");
    internal static void RequireEdit(WorkItem item, ActorContext actor)
    {
        if (!IsValidation(item)) return;
        actor.RequirePermission(item.Module, "view");
        actor.RequirePermission(Screen, "edit");
    }
    internal static UpdateWorkItemCommand Prepare(WorkItem item, UpdateWorkItemCommand command, ActorContext actor)
    {
        RequireEdit(item, actor);
        if (item.Module != "cs" || !IsValidation(item)) return command;
        var old = Detail(item.Description); var next = Detail(command.Description);
        if (next["kind"]?.ToString() != "csJourney") throw new DomainException("Preserve os dados do acompanhamento.", 403);
        if (string.IsNullOrWhiteSpace(old["checkedAt"]?.ToString()) && !string.IsNullOrWhiteSpace(next["checkedAt"]?.ToString()))
        { next["checkedAt"] = DateTimeOffset.UtcNow.ToString("O"); next["checkedBy"] = actor.DisplayName; }
        return command with { Description = next.ToJsonString() };
    }
}
