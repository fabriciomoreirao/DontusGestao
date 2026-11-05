using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

public static class CancellationResponsibilityPolicy
{
    public sealed record Assignment(string Description, string Owner);

    public static Assignment Create(string? description) => Prepare(Detail(description), null, "");

    public static Assignment Update(string previous, string? description, string previousOwner) =>
        Prepare(Detail(description), Detail(previous), previousOwner);

    private static Assignment Prepare(JsonObject detail, JsonObject? previous, string previousOwner)
    {
        // Sparse updates from existing clients must retain each independent role.
        if (previous is not null)
            foreach (var field in new[] { "seller", "csOwner", "reversalOwner" })
                if (!detail.ContainsKey(field) && previous[field] is { } value) detail[field] = value.DeepClone();
        if (!detail.ContainsKey("reversalOwner") && previous is not null)
            detail["reversalOwner"] = previousOwner;
        var owner = detail["reversalOwner"] is JsonValue fieldValue && fieldValue.TryGetValue<string>(out var name) ? name.Trim() : "";
        if (string.IsNullOrWhiteSpace(owner)) throw new DomainException("Informe o responsável pela reversão do cancelamento.");
        detail["reversalOwner"] = owner;
        return new(detail.ToJsonString(), owner);
    }

    private static JsonObject Detail(string? description)
    {
        try { return JsonNode.Parse(description ?? "") as JsonObject ?? throw new JsonException(); }
        catch (JsonException) { throw new DomainException("Informe os dados da solicitação de cancelamento em formato válido."); }
    }
}
