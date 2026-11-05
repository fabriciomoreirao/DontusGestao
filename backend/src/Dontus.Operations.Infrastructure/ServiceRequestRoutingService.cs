using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class ServiceRequestRoutingService(OperationsDbContext db, IOperationsService operations,
    ITaskService tasks, ISuggestionService suggestions)
{
    public async Task<Guid> RouteAsync(Guid id, long version, string target, CreateCorporateTaskCommand? task,
        ActorContext actor, CancellationToken ct = default)
    {
        actor.RequirePermission("serviceFollowup", "edit");
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (db.Database.ProviderName?.Contains("Npgsql") == true)
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({id.ToString()}, 0))", ct);
            var source = await db.WorkItems.SingleOrDefaultAsync(x => x.Id == id && x.Module == "serviceFollowup", ct)
                ?? throw new DomainException("Acompanhamento de chamado não encontrado.", 404);
            var detail = ServiceRequestWorkflow.Read(source.Description);
            if (detail?["kind"]?.ToString() != "serviceRequestFollowup") throw new DomainException("Dados do chamado inválidos.");
            if (Guid.TryParse(detail["routedId"]?.ToString(), out var existing))
            {
                if (detail["routedTo"]?.ToString() != target) throw new DomainException("Este chamado já foi encaminhado para outra funcionalidade.", 409);
                return existing;
            }
            if (source.Version != version) throw new DomainException("O chamado foi alterado. Atualize a tela e tente novamente.", 409);
            var module = target switch { "Desenvolvimento" => "ti", "Tarefa" => "tasks", "Sugestão" => "suggestions",
                "Cancelamento" => "cancellations", "Nova contratação" => "commercial", "Acompanhamento" => "cs", _ => "" };
            if (module.Length == 0) throw new DomainException("Selecione uma funcionalidade válida.");
            actor.RequirePermission(module, "create");
            var at = DateTimeOffset.UtcNow;
            var protocol = detail["protocol"]?.ToString() ?? "";
            var name = detail["fullName"]?.ToString() ?? source.CustomerName;
            var summary = detail["summary"]?.ToString() ?? "";
            var code = detail["clientId"]?.ToString() ?? "";
            var phone = detail["whatsapp"]?.ToString() ?? "";
            var sourceId = detail["sourceRequestId"]?.ToString() ?? source.Id.ToString();
            var sourceUrl = $"/?mod=serviceFollowup&card={source.Id}";
            var linkedSummary = $"Chamado {protocol} · {name}\n{summary}\nOrigem: {sourceUrl}";
            Guid destination;
            if (target == "Tarefa")
            {
                if (task is null) throw new DomainException("Preencha os dados da tarefa.");
                var result = await tasks.CreateAsync(task with { CustomerId = source.CustomerId, CustomerCode = code,
                    CustomerName = source.CustomerName, ClientWhatsApp = phone, ExternalLink = sourceUrl,
                    Description = $"{task.Description}\n\n{linkedSummary}" }, actor, ct);
                destination = result.Id;
                var uploader = await db.Users.Where(x => x.Email == actor.Email).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
                if (uploader.HasValue)
                    foreach (var attachment in (detail["attachments"] as JsonArray ?? new JsonArray()).OfType<JsonObject>())
                        if (Guid.TryParse(attachment["id"]?.ToString(), out var fileId) && Guid.TryParse(sourceId, out var requestId))
                            db.TaskAttachments.Add(new() { TaskId = destination, UploadedByUserId = uploader.Value,
                                FileName = attachment["name"]?.ToString() ?? "Anexo do chamado",
                                ContentType = "text/uri-list", StorageKey = $"/api/service-request-files/{requestId}/{fileId}" });
            }
            else if (target == "Sugestão")
            {
                var priority = await db.SuggestionPriorities.Where(x => x.Active).OrderBy(x => x.DisplayOrder).FirstOrDefaultAsync(ct)
                    ?? throw new DomainException("Cadastre uma prioridade ativa em Sugestões.");
                destination = (await suggestions.CreateSuggestionAsync(new($"{protocol} · {summary[..Math.Min(120, summary.Length)]}", linkedSummary, source.CustomerId, priority.Id, false, false), actor, ct)).Id;
            }
            else
            {
                var payload = new JsonObject { ["sourceModule"] = "serviceFollowup", ["sourceItemId"] = source.Id.ToString(),
                    ["sourceRequestId"] = sourceId, ["sourceProtocol"] = protocol, ["clientId"] = code };
                var type = ""; var owner = "Não atribuído"; var team = source.Team; var status = "Novo";
                switch (target)
                {
                    case "Desenvolvimento":
                        type = "Tarefa de desenvolvimento"; team = "TI"; status = "Nova";
                        payload["kind"] = "developmentTask"; payload["sourceTaskId"] = source.Id.ToString();
                        payload["sourceDepartment"] = source.Team; payload["triageStage"] = "Recebida"; payload["processStage"] = "Aguardando triagem";
                        payload["sourceSnapshot"] = new JsonObject { ["description"] = summary, ["status"] = source.Status,
                            ["type"] = detail["selectedType"]?.DeepClone(), ["responsible"] = source.Owner,
                            ["attachments"] = new JsonArray((detail["attachments"] as JsonArray ?? new JsonArray()).OfType<JsonObject>().Select(x => (JsonNode)new JsonObject { ["fileName"] = x["name"]?.DeepClone(), ["url"] = $"/api/service-request-files/{sourceId}/{x["id"]}" }).ToArray()),
                            ["comments"] = new JsonArray((detail["comments"] as JsonArray ?? new JsonArray()).OfType<JsonObject>().Select(x => (JsonNode)new JsonObject { ["authorName"] = x["by"]?.DeepClone(), ["body"] = x["text"]?.DeepClone(), ["createdAt"] = x["at"]?.DeepClone() }).ToArray()) };
                        break;
                    case "Cancelamento":
                        type = "Solicitação de cancelamento"; team = "Comercial"; status = "Fila de espera";
                        payload["kind"] = "cancellationJourney"; payload["requestDate"] = at.ToOffset(TimeSpan.FromHours(-3)).ToString("yyyy-MM-dd");
                        payload["requestMonth"] = at.ToOffset(TimeSpan.FromHours(-3)).ToString("yyyy-MM"); payload["customerName"] = name;
                        payload["requesterPhone"] = phone; payload["reason"] = summary; payload["notes"] = linkedSummary;
                        payload["csOwner"] = source.Owner; payload["attachments"] = new JsonArray();
                        owner = actor.DisplayName; payload["reversalOwner"] = owner;
                        payload["history"] = JsonSerializer.SerializeToNode(new[] { new { id = Guid.NewGuid(), type = "Abertura", text = linkedSummary, at, author = actor.DisplayName } });
                        break;
                    case "Nova contratação":
                        type = "Lead comercial"; team = "CRM Comercial"; owner = "Fila Comercial";
                        payload["kind"] = "commercialLead"; payload["customer"] = name; payload["phone"] = phone;
                        payload["entryDate"] = at.ToOffset(TimeSpan.FromHours(-3)).ToString("yyyy-MM-dd"); payload["seller"] = owner;
                        payload["source"] = $"Chamado {protocol}"; payload["funnel"] = "CRM Comercial"; payload["stage"] = "Lead recebido";
                        payload["labels"] = new JsonArray(); payload["products"] = new JsonArray(); payload["comments"] = new JsonArray();
                        payload["follows"] = JsonSerializer.SerializeToNode(new[] { new { type = "Chamado", text = linkedSummary, createdAt = at, author = actor.DisplayName } });
                        break;
                    case "Acompanhamento":
                        type = "Acompanhamento de retenção"; team = "Sucesso do Cliente"; status = "EmAcompanhamento";
                        payload["kind"] = "csJourney"; payload["track"] = "retention"; payload["phase"] = "tracking";
                        payload["status"] = "Pendente"; payload["trackingStartedAt"] = at.ToString("O");
                        payload["featuresBase"] = new JsonArray(); payload["featuresActive"] = new JsonArray(); payload["featuresPlus"] = new JsonArray();
                        payload["scoreEvolution"] = new JsonArray(); payload["labels"] = new JsonArray();
                        payload["follows"] = JsonSerializer.SerializeToNode(new[] { new { kind = "Chamado", text = linkedSummary, createdAt = at, actor = actor.DisplayName } });
                        break;
                }
                if (payload["history"] is null) ServiceRequestWorkflow.AddHistory(payload, linkedSummary, at, actor.DisplayName);
                destination = await operations.CreateWorkItemAsync(new(module, type, $"{protocol} · {name}", source.CustomerId,
                    source.CustomerName, owner, team, source.Priority, null, null, 0, payload.ToJsonString(), [], "serviceFollowup", source.Id, status), actor, ct);
            }
            detail["routedId"] = destination.ToString(); detail["routedTo"] = target; detail["routedAt"] = at.ToString("O"); detail["routedBy"] = actor.DisplayName;
            ServiceRequestWorkflow.AddHistory(detail, $"Encaminhado para {target}.", at, actor.DisplayName);
            source.Description = detail.ToJsonString(); source.Status = "Em processo"; source.UpdatedAt = at; source.Version++;
            db.AuditEvents.Add(new AuditEvent { ActorEmail = actor.Email, Action = "Route", Resource = "work_item", ResourceId = source.Id.ToString(),
                Module = source.Module, DetailsJson = JsonSerializer.Serialize(new { target, destination, at, by = actor.DisplayName }), Result = "Sucesso" });
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
            return destination;
        });
    }
}
