using System.Text.Json.Nodes;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public static class ServiceRequestWorkflow
{
    public static string? DepartmentFor(string classification) => classification switch
    {
        "Desenvolvimento" or "Tarefa" or "Sugestão" => "Suporte",
        "Reclamação" or "Elogio" => "Sucesso do Cliente",
        "Cancelamento" or "Nova contratação" => "Comercial",
        _ => null,
    };

    // The caller saves both cards in the same transaction.
    public static async Task SynchronizeAsync(OperationsDbContext db, WorkItem source, JsonObject detail,
        string classification, DateTimeOffset at, string by, CancellationToken ct = default)
    {
        var sector = DepartmentFor(classification) ?? throw new DomainException("Classificação de chamado inválida.");
        source.Status = classification; source.Team = sector;
        if (source.Owner is "Triagem inteligente" or "Central de Chamados" or "") source.Owner = "Não atribuído";
        detail["classification"] = classification; detail["sector"] = sector;
        var sourceKey = source.Id.ToString();
        var candidates = await db.WorkItems.Where(x => x.Module == "serviceFollowup" && (x.OriginId == source.Id || x.Description.Contains(sourceKey))).ToListAsync(ct);
        var followup = candidates.FirstOrDefault(x => x.OriginId == source.Id || Read(x.Description)?["sourceRequestId"]?.ToString() == sourceKey);
        if (followup is null)
        {
            var copy = (JsonObject)detail.DeepClone();
            copy["kind"] = "serviceRequestFollowup"; copy["sourceRequestId"] = source.Id.ToString();
            // Replication is independent from the later functional hand-off.
            copy.Remove("followupId");
            if (copy["routedTo"]?.ToString() is "Reclamação" or "Elogio") { copy.Remove("routedTo"); copy.Remove("routedId"); copy.Remove("routedAt"); }
            AddHistory(copy, $"Chamado classificado como {classification} e encaminhado ao setor {sector}.", at, by);
            followup = new WorkItem { Module = "serviceFollowup", RecordType = "Acompanhamento de chamado",
                Title = $"{detail["protocol"]} · {detail["fullName"]}", CustomerId = source.CustomerId,
                CustomerName = source.CustomerName, Owner = source.Owner, Team = sector, Status = copy["routedId"] is null ? "Em espera" : "Em processo",
                Priority = source.Priority, OriginType = "serviceRequests", OriginId = source.Id,
                Description = copy.ToJsonString(), CreatedBy = source.CreatedBy, CreatedAt = at, UpdatedAt = at };
            db.WorkItems.Add(followup);
            db.Activities.Add(new Activity { EntityType = "work_item", EntityId = followup.Id, Module = followup.Module,
                Kind = "Encaminhado ao setor", Summary = $"{detail["protocol"]} · {sector}", Actor = by });
        }
        else
        {
            var copy = Read(followup.Description) ?? new JsonObject();
            if (copy["classification"]?.ToString() != classification || followup.Team != sector)
            {
                copy["classification"] = classification; copy["sector"] = sector;
                AddHistory(copy, $"Classificação atualizada para {classification}; setor responsável: {sector}.", at, by);
                followup.Team = sector; followup.Description = copy.ToJsonString(); followup.UpdatedAt = at; followup.Version++;
            }
            followup.OriginType = "serviceRequests"; followup.OriginId = source.Id;
        }
        detail["followupId"] = followup.Id.ToString(); source.Description = detail.ToJsonString();
    }

    public static async Task ReconcileExistingAsync(OperationsDbContext db, CancellationToken ct = default)
    {
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (db.Database.ProviderName?.Contains("Npgsql") == true)
                await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74219, 7)", ct);
            var sources = await db.WorkItems.Where(x => x.Module == "serviceRequests").ToListAsync(ct);
            foreach (var source in sources)
            {
                var detail = Read(source.Description);
                if (detail?["kind"]?.ToString() != "serviceRequest" || detail["followupId"] is not null) continue;
                var classification = DepartmentFor(source.Status) is not null ? source.Status : detail["aiClassification"]?.ToString() ?? "";
                if (DepartmentFor(classification) is null) continue;
                await SynchronizeAsync(db, source, detail, classification, source.CreatedAt, "Triagem inteligente", ct);
                source.Version++;
            }
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
        });
    }

    public static JsonObject? Read(string value) { try { return JsonNode.Parse(value) as JsonObject; } catch (System.Text.Json.JsonException) { return null; } }
    public static void AddHistory(JsonObject detail, string text, DateTimeOffset at, string by)
    {
        if (detail["history"] is not JsonArray) detail["history"] = new JsonArray();
        ((JsonArray)detail["history"]!).Add(new JsonObject { ["text"] = text, ["at"] = at.ToString("O"), ["by"] = by });
    }
}
