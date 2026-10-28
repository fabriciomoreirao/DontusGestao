using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Dontus.Operations.Infrastructure;

public sealed class ServiceRequestCreationService(OperationsDbContext db, TimeProvider? clock = null)
{
    public async Task<string> CreateAsync(WorkItem item, JsonObject detail, CancellationToken ct = default)
    {
        if (item.Module != "serviceRequests") throw new DomainException("O protocolo de chamado exige um registro de Chamados.");
        var now = (clock ?? TimeProvider.System).GetUtcNow();
        var year = now.ToOffset(TimeSpan.FromHours(-3)).Year;
        item.CreatedAt = now; item.UpdatedAt = now;
        var attempt = 0;
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            // Recover an uncertain commit without allocating another protocol for the same request.
            if (attempt++ > 0)
            {
                db.ChangeTracker.Clear();
                var saved = await db.WorkItems.AsNoTracking().SingleOrDefaultAsync(x => x.Id == item.Id, ct);
                if (saved is not null)
                    return JsonNode.Parse(saved.Description)!["protocol"]!.ToString();
            }
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            long number;
            if (db.Database.IsRelational())
            {
                // The row lock held by this upsert serializes concurrent requests for the same year.
                await using var command = db.Database.GetDbConnection().CreateCommand();
                command.Transaction = transaction!.GetDbTransaction();
                command.CommandText = """
                    INSERT INTO service_request_protocol_counters ("Year", "LastNumber") VALUES (@year, 1)
                    ON CONFLICT ("Year") DO UPDATE
                    SET "LastNumber" = service_request_protocol_counters."LastNumber" + 1
                    RETURNING "LastNumber";
                    """;
                var parameter = command.CreateParameter(); parameter.ParameterName = "year"; parameter.Value = year;
                command.Parameters.Add(parameter);
                number = Convert.ToInt64(await command.ExecuteScalarAsync(ct), CultureInfo.InvariantCulture);
            }
            else
            {
                var counter = await db.ServiceRequestProtocolCounters.SingleOrDefaultAsync(x => x.Year == year, ct);
                if (counter is null) { counter = new() { Year = year }; db.ServiceRequestProtocolCounters.Add(counter); }
                number = ++counter.LastNumber;
            }
            var protocol = FormattableString.Invariant($"C{year % 100:00}{number:0000}");
            detail["protocol"] = protocol; detail["submittedAt"] = now.ToString("O");
            item.Description = detail.ToJsonString();
            db.WorkItems.Add(item);
            db.Activities.Add(new Activity { EntityType = "work_item", EntityId = item.Id, Module = item.Module,
                Kind = "Chamado recebido", Summary = $"{protocol} · {detail["aiClassification"]}", Actor = "Integração externa" });
            db.AuditEvents.Add(new AuditEvent { ActorEmail = "integracao-chamados", Action = "Create", Resource = "work_item",
                ResourceId = item.Id.ToString(), Module = item.Module, DetailsJson = JsonSerializer.Serialize(new {
                    protocol, clientId = detail["clientId"]?.ToString(), selectedType = detail["selectedType"]?.ToString(), classification = detail["aiClassification"]?.ToString() }), Result = "Sucesso" });
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
            return protocol;
        });
    }
}
