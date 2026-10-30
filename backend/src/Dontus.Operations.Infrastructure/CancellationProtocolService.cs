using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Dontus.Operations.Infrastructure;

public sealed class CancellationProtocolService(OperationsDbContext db, TimeProvider? clock = null)
{
    public async Task<string> CreateAsync(WorkItem item, ActorContext actor, CancellationToken ct = default)
    {
        if (item.Module != "cancellations") throw new DomainException("O protocolo de cancelamento exige um registro de Cancelamentos.");
        var detail = Detail(item.Description);
        var now = (clock ?? TimeProvider.System).GetUtcNow();
        var year = now.ToOffset(TimeSpan.FromHours(-3)).Year;
        item.CreatedAt = now; item.UpdatedAt = now;
        var attempt = 0;
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            if (attempt++ > 0)
            {
                db.ChangeTracker.Clear();
                var saved = await db.WorkItems.AsNoTracking().SingleOrDefaultAsync(x => x.Id == item.Id, ct);
                if (saved is not null) return Detail(saved.Description)["protocol"]!.ToString();
            }
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            long number;
            if (db.Database.IsRelational())
            {
                // The upsert holds a row lock until the cancellation and its history are committed.
                await using var command = db.Database.GetDbConnection().CreateCommand();
                command.Transaction = transaction!.GetDbTransaction();
                command.CommandText = """
                    INSERT INTO cancellation_protocol_counters ("Year", "LastNumber") VALUES (@year, 1)
                    ON CONFLICT ("Year") DO UPDATE
                    SET "LastNumber" = cancellation_protocol_counters."LastNumber" + 1
                    RETURNING "LastNumber";
                    """;
                var parameter = command.CreateParameter(); parameter.ParameterName = "year"; parameter.Value = year;
                command.Parameters.Add(parameter);
                number = Convert.ToInt64(await command.ExecuteScalarAsync(ct), CultureInfo.InvariantCulture);
            }
            else
            {
                var counter = await db.CancellationProtocolCounters.SingleOrDefaultAsync(x => x.Year == year, ct);
                if (counter is null) { counter = new() { Year = year }; db.CancellationProtocolCounters.Add(counter); }
                number = ++counter.LastNumber;
            }
            var protocol = FormattableString.Invariant($"C{year % 100:00}{number:0000}");
            detail["protocol"] = protocol;
            item.Description = detail.ToJsonString();
            db.WorkItems.Add(item);
            db.Activities.Add(new Activity { EntityType = "work_item", EntityId = item.Id, Module = item.Module,
                Kind = "Criado", Summary = $"{protocol} · {item.RecordType} criado: {item.Title}", Actor = actor.DisplayName });
            db.AuditEvents.Add(new AuditEvent { ActorEmail = actor.Email, Action = "Create", Resource = "work_item",
                ResourceId = item.Id.ToString(), Module = item.Module,
                DetailsJson = JsonSerializer.Serialize(new { protocol, item.RecordType, item.Title }), Result = "Sucesso" });
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
            return protocol;
        });
    }

    public static string PreserveProtocol(string previous, string? next)
    {
        var saved = Detail(previous);
        var detail = Detail(next);
        // Editing, forwarding and recording contacts must never change the assigned protocol.
        if (saved["protocol"] is { } protocol) detail["protocol"] = protocol.DeepClone();
        else detail.Remove("protocol");
        return detail.ToJsonString();
    }

    private static JsonObject Detail(string? value)
    {
        try { return JsonNode.Parse(value ?? "") as JsonObject ?? throw new JsonException(); }
        catch (JsonException) { throw new DomainException("Informe os dados da solicitação de cancelamento em formato válido."); }
    }
}
