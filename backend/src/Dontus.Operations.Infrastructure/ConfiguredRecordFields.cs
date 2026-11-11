using System.Text.Json.Nodes;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
namespace Dontus.Operations.Infrastructure;

internal static class ConfiguredRecordFields
{
    public static async Task ValidateAsync(OperationsDbContext db, string? description, string? previous, CancellationToken ct)
    {
        JsonObject? detail, before;
        try { detail = JsonNode.Parse(description ?? "") as JsonObject; before = JsonNode.Parse(previous ?? "{}") as JsonObject; }
        catch (System.Text.Json.JsonException) { return; }
        var fields = detail?["kind"]?.ToString() switch
        {
            "waitingQueue" => new[] { ("requestType", "waitingQueueRequestType", "tipo de solicitação") },
            "serviceRecord" => new[] { ("origin", "serviceOrigin", "origem do atendimento"), ("problem", "serviceProblem", "problema / situação") },
            "liaJourney" => new[] { ("requestType", "liaRequestType", "tipo de solicitação"), ("sector", "liaOrigin", "origem") },
            "commercialLead" => new[] { ("source", "acquisitionChannel", "origem do lead") },
            "directSale" => new[] { ("origin", "acquisitionChannel", "origem da venda") },
            "cancellationJourney" => new[] { ("reason", "cancellationReason", "motivo do cancelamento") },
            _ => Array.Empty<(string, string, string)>()
        };
        if (detail?["kind"]?.ToString() == "serviceRecord" && (detail["contactTypes"] as JsonArray)?.Count is not > 0
            && (previous is null || (before?["contactTypes"] as JsonArray)?.Count is > 0)
            && await db.CustomerCatalogOptions.AnyAsync(option=>option.Active&&option.Catalog=="serviceContactType",ct))
            throw new DomainException("Selecione o tipo de contato do atendimento.");
        foreach (var (field, catalog, label) in fields)
        {
            var value = detail?[field]?.ToString();
            // An unrelated update of a legacy record must not invent an origin or type.
            if (previous is not null && string.IsNullOrWhiteSpace(before?[field]?.ToString()) && string.IsNullOrWhiteSpace(value)) continue;
            if (string.IsNullOrWhiteSpace(value) && await db.CustomerCatalogOptions.AnyAsync(option => option.Active && option.Catalog == catalog, ct))
                throw new DomainException($"Selecione {label}.");
        }
    }
}
