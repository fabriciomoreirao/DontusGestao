using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed partial class OperationsService
{
    // Embedded journeys keep the same agenda handoff as standalone CS journeys.
    private async Task PrepareStrategicFollowupAssignmentsAsync(WorkItem network, string? description, ActorContext actor, CancellationToken ct)
    {
        if (network.Module != "cs") return;
        JsonObject? previous;
        JsonObject? next;
        try
        {
            previous = JsonNode.Parse(network.Description) as JsonObject;
            next = JsonNode.Parse(description ?? "{}") as JsonObject;
        }
        catch (System.Text.Json.JsonException) { return; }
        if (previous?["kind"]?.ToString() != "enterpriseNetwork" || next?["kind"]?.ToString() != "enterpriseNetwork" || next["units"] is not JsonArray units) return;
        var previousUnits = previous["units"] as JsonArray ?? new JsonArray();
        foreach (var unit in units.OfType<JsonObject>())
        {
            if (unit["followUp"] is not JsonObject followUp || followUp["kind"]?.ToString() != "csJourney") continue;
            var old = previousUnits.OfType<JsonObject>().FirstOrDefault(entry => entry["id"]?.ToString() == unit["id"]?.ToString());
            var oldOwner = old?["followUpOwner"]?.ToString() ?? network.Owner;
            var owner = unit["followUpOwner"]?.ToString() ?? network.Owner;
            if (string.Equals(oldOwner, owner, StringComparison.OrdinalIgnoreCase)) continue;
            var user = await db.Users.SingleOrDefaultAsync(entry => entry.Active && entry.DisplayName == owner, ct)
                ?? throw new DomainException("Selecione um responsável ativo para o acompanhamento da unidade.");
            var journey = new WorkItem
            {
                Id = network.Id,
                Module = "cs",
                RecordType = "Acompanhamento da unidade",
                Title = unit["name"]?.ToString() ?? network.Title,
                Status = followUp["status"]?.ToString() ?? network.Status,
                CreatedBy = network.CreatedBy,
                Description = followUp.ToJsonString(),
                CustomerId = Guid.TryParse(unit["customerId"]?.ToString(), out var customerId) ? customerId : null
            };
            await new AgendaService(db).PrepareJourneyAssignmentAsync(journey, user.Id, actor, ct);
        }
    }
}
