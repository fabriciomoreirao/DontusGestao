using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class CancellationTaskService(OperationsDbContext db, ITaskService tasks)
{
    public async Task<CreatedCorporateTaskDto> CreateAsync(Guid cancellationId, long version, Guid requestId,
        CreateCorporateTaskCommand draft, ActorContext actor, CancellationToken ct = default)
    {
        actor.RequirePermission("cancellations", "edit");
        actor.RequirePermission("tasks", "create");
        if (requestId == Guid.Empty) throw new DomainException("Identificação da criação de tarefa obrigatória.");
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (db.Database.ProviderName?.Contains("Npgsql") == true)
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({cancellationId.ToString()}, 0))", ct);
            var source = await db.WorkItems.SingleOrDefaultAsync(item => item.Id == cancellationId && item.Module == "cancellations", ct)
                ?? throw new DomainException("Cancelamento não encontrado.", 404);
            JsonObject detail;
            try { detail = JsonNode.Parse(source.Description) as JsonObject ?? throw new JsonException(); }
            catch (JsonException) { throw new DomainException("Dados do cancelamento inválidos."); }
            if (Text(detail, "kind") != "cancellationJourney") throw new DomainException("Dados do cancelamento inválidos.");
            var history = detail["history"] as JsonArray ?? new JsonArray();
            // A retry of the same modal submission returns the task already created.
            var previous = history.OfType<JsonObject>().FirstOrDefault(entry => Text(entry, "taskCreationId") == requestId.ToString());
            if (previous is not null && Guid.TryParse(Text(previous, "taskId"), out var existingId))
            {
                var existing = await db.CorporateTasks.AsNoTracking().SingleOrDefaultAsync(task => task.Id == existingId, ct)
                    ?? throw new DomainException("A tarefa vinculada foi excluída. Abra novamente o formulário para criar outra tarefa.", 409);
                return new CreatedCorporateTaskDto(existing.Id, existing.Protocol);
            }
            if (source.Version != version) throw new DomainException("O cancelamento foi alterado. Atualize a tela e tente novamente.", 409);
            var department = await db.TaskDepartments.AsNoTracking().SingleOrDefaultAsync(entry => entry.Id == draft.CurrentDepartmentId && entry.Active, ct)
                ?? throw new DomainException("Selecione um setor ativo para a tarefa.");
            var protocol = Text(detail, "protocol");
            var clientId = Text(detail, "clientId");
            var customer = Text(detail, "customerName");
            if (string.IsNullOrWhiteSpace(customer)) customer = string.IsNullOrWhiteSpace(source.CustomerName) ? source.Title : source.CustomerName;
            var origin = $"Cancelamento {protocol} · {customer} · ID {clientId}";
            var result = await tasks.CreateAsync(draft with
            {
                SourceDepartmentId = department.Id, CurrentDepartmentId = department.Id,
                CustomerId = source.CustomerId, CustomerCode = clientId, CustomerName = customer,
                ExternalLink = $"/?mod=cancellations&cancellation={source.Id}",
                Description = $"{(draft.Description ?? "").Trim()}\n\nOrigem: {origin}",
            }, actor, ct);
            var task = await db.CorporateTasks.SingleAsync(entry => entry.Id == result.Id, ct);
            var at = DateTimeOffset.UtcNow;
            var text = $"Tarefa {result.Protocol} criada no setor {department.Name}: {task.Title}.";
            history.Add(new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["type"] = "Tarefa criada", ["text"] = text,
                ["at"] = at.ToString("O"), ["author"] = actor.DisplayName, ["taskId"] = task.Id.ToString(),
                ["taskProtocol"] = result.Protocol, ["taskCreationId"] = requestId.ToString() });
            if (detail["history"] is not JsonArray) detail["history"] = history;
            source.Description = detail.ToJsonString(); source.UpdatedAt = at; source.Version++;
            db.TaskHistory.Add(new TaskHistory { TaskId = task.Id, ActorUserId = task.CreatorUserId, EventType = "cancellation_linked",
                Summary = $"Tarefa criada a partir do {origin}.", Source = "cancellations",
                NewValueJson = JsonSerializer.Serialize(new { cancellationId = source.Id, cancellationProtocol = protocol }), CreatedAt = at });
            db.Activities.Add(new Activity { EntityType = "work_item", EntityId = source.Id, Module = "cancellations", Kind = "Tarefa criada", Summary = text, Actor = actor.DisplayName });
            db.AuditEvents.Add(new AuditEvent { ActorEmail = actor.Email, Action = "CreateTask", Resource = "work_item", ResourceId = source.Id.ToString(), Module = "cancellations",
                DetailsJson = JsonSerializer.Serialize(new { taskId = task.Id, taskProtocol = result.Protocol, departmentId = department.Id, taskCreationId = requestId }) });
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
            return result;
        });
    }

    private static string Text(JsonObject detail, string field) => detail[field] is JsonValue value && value.TryGetValue<string>(out var text) ? text ?? "" : "";
}
