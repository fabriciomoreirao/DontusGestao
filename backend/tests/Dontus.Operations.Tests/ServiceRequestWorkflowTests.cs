using System.Reflection;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class ServiceRequestWorkflowTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Actor(params string[] modules) => new("user@test.local", "Pessoa Teste", "Colaborador", "Suporte",
        modules.Select(module => new EffectivePermission(module, true, module != "serviceFollowup", true, false, false)).ToArray());
    private static WorkItem Source() => new() { Module = "serviceRequests", RecordType = "Chamado externo", Status = "Triagem", Title = "Clínica", CustomerName = "Clínica", Owner = "Triagem inteligente", CreatedBy = "integracao-chamados" };
    private static JsonObject Detail(string classification = "Desenvolvimento") => new() { ["kind"] = "serviceRequest", ["protocol"] = "C260001", ["clientId"] = "123456", ["fullName"] = "Clínica", ["whatsapp"] = "11999999999", ["summary"] = "Não consigo salvar o pagamento", ["selectedType"] = "Bug", ["aiClassification"] = classification, ["history"] = new JsonArray(), ["attachments"] = new JsonArray() };
    private static async Task<WorkItem> Followup(OperationsDbContext db, string classification = "Desenvolvimento")
    {
        var source = Source(); db.WorkItems.Add(source);
        await ServiceRequestWorkflow.SynchronizeAsync(db, source, Detail(classification), classification, DateTimeOffset.UtcNow, "IA");
        await db.SaveChangesAsync();
        return await db.WorkItems.SingleAsync(x => x.Module == "serviceFollowup");
    }

    [Theory]
    [InlineData("Desenvolvimento", "Suporte")]
    [InlineData("Tarefa", "Suporte")]
    [InlineData("Sugestão", "Suporte")]
    [InlineData("Reclamação", "Sucesso do Cliente")]
    [InlineData("Elogio", "Sucesso do Cliente")]
    [InlineData("Cancelamento", "Comercial")]
    [InlineData("Nova contratação", "Comercial")]
    public async Task Receipt_classifies_and_replicates_to_the_correct_sector_in_one_save(string classification, string sector)
    {
        await using var db = Context(); var source = Source();
        await new ServiceRequestCreationService(db).CreateAsync(source, Detail(classification));
        var replica = await db.WorkItems.SingleAsync(x => x.Module == "serviceFollowup");
        Assert.Equal(classification, source.Status); Assert.Equal(sector, source.Team); Assert.Equal(sector, replica.Team);
        Assert.Equal("Não atribuído", replica.Owner); Assert.Equal("Em espera", replica.Status); Assert.Equal(source.Id, replica.OriginId);
        var copy = JsonNode.Parse(replica.Description)!; Assert.Equal(source.Id.ToString(), copy["sourceRequestId"]!.ToString());
        Assert.Equal(JsonNode.Parse(source.Description)!["protocol"]!.ToString(), copy["protocol"]!.ToString());
        Assert.Equal("Não consigo salvar o pagamento", copy["summary"]!.ToString());
    }

    [Fact]
    public async Task Reclassifying_preserves_followup_progress_and_does_not_duplicate_it()
    {
        await using var db = Context(); var replica = await Followup(db); replica.Status = "Concluído";
        var source = await db.WorkItems.SingleAsync(x => x.Module == "serviceRequests");
        await new OperationsService(db).TransitionWorkItemAsync(new(source.Id, "Cancelamento", source.Version, true, true), Actor("serviceRequests"));
        Assert.Single(db.WorkItems.Where(x => x.Module == "serviceFollowup"));
        Assert.Equal("Comercial", replica.Team); Assert.Equal("Concluído", replica.Status);
        Assert.Equal("Cancelamento", JsonNode.Parse(replica.Description)!["classification"]!.ToString());
    }

    [Fact]
    public async Task Legacy_requests_are_reconciled_once_without_replacing_existing_comments()
    {
        await using var db = Context(); var source = Source(); source.Status = "Triagem"; source.Description = Detail().ToJsonString();
        db.WorkItems.Add(source); await db.SaveChangesAsync();
        await ServiceRequestWorkflow.ReconcileExistingAsync(db); await ServiceRequestWorkflow.ReconcileExistingAsync(db);
        Assert.Single(db.WorkItems.Where(x => x.Module == "serviceFollowup"));
        Assert.Equal("Desenvolvimento", (await db.WorkItems.SingleAsync(x => x.Module == "serviceRequests")).Status);
    }

    [Theory]
    [InlineData("Desenvolvimento", "ti", "developmentTask")]
    [InlineData("Cancelamento", "cancellations", "cancellationJourney")]
    [InlineData("Nova contratação", "commercial", "commercialLead")]
    [InlineData("Acompanhamento", "cs", "csJourney")]
    public async Task Functional_handoff_is_audited_and_idempotent(string target, string module, string kind)
    {
        await using var db = Context(); var source = await Followup(db); var id = source.Id; var version = source.Version;
        var service = new ServiceRequestRoutingService(db, new OperationsService(db), null!, null!); var actor = Actor("serviceFollowup", module);
        var destination = await service.RouteAsync(id, version, target, null, actor);
        Assert.Equal(destination, await service.RouteAsync(id, version, target, null, actor));
        var created = await db.WorkItems.SingleAsync(x => x.Id == destination);
        Assert.Equal(module, created.Module); Assert.Equal(kind, JsonNode.Parse(created.Description)!["kind"]!.ToString());
        if (module == "cancellations")
        {
            Assert.Equal(actor.DisplayName, created.Owner);
            Assert.Equal(actor.DisplayName, JsonNode.Parse(created.Description)!["reversalOwner"]!.ToString());
            Assert.Equal(source.Owner, JsonNode.Parse(created.Description)!["csOwner"]!.ToString());
        }
        Assert.Equal(id, created.OriginId); Assert.Single(db.WorkItems.Where(x => x.Module == module));
        var result = await db.WorkItems.SingleAsync(x => x.Id == id); var detail = JsonNode.Parse(result.Description)!;
        Assert.Equal("Em processo", result.Status); Assert.Equal(actor.DisplayName, detail["routedBy"]!.ToString());
        Assert.True(DateTimeOffset.TryParse(detail["routedAt"]!.ToString(), out _)); Assert.Single(db.AuditEvents.Where(x => x.Action == "Route"));
    }

    [Fact]
    public async Task Handoff_checks_permissions_stale_versions_and_invalid_targets_before_creating()
    {
        await using var db = Context(); var source = await Followup(db);
        var service = new ServiceRequestRoutingService(db, new OperationsService(db), null!, null!);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.RouteAsync(source.Id, source.Version, "Desenvolvimento", null, Actor("serviceFollowup")))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.RouteAsync(source.Id, 99, "Desenvolvimento", null, Actor("serviceFollowup", "ti")))).StatusCode);
        await Assert.ThrowsAsync<DomainException>(() => service.RouteAsync(source.Id, source.Version, "Financeiro", null, Actor("serviceFollowup", "finance")));
        Assert.Empty(db.WorkItems.Where(x => x.Module == "ti"));
    }

    public class TaskProxy : DispatchProxy
    {
        public CreateCorporateTaskCommand? Command;
        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            if (method?.Name != "CreateAsync") throw new NotSupportedException();
            Command = (CreateCorporateTaskCommand)args![0]!;
            return Task.FromResult(new CreatedCorporateTaskDto(Guid.NewGuid(), "T260001"));
        }
    }
    [Fact]
    public async Task Task_handoff_preserves_customer_context_and_the_link_to_the_original_request()
    {
        await using var db = Context(); var source = await Followup(db, "Tarefa");
        var tasks = DispatchProxy.Create<ITaskService, TaskProxy>();
        var service = new ServiceRequestRoutingService(db, new OperationsService(db), tasks, null!);
        var command = new CreateCorporateTaskCommand("Tarefa", "Investigar", Guid.NewGuid(), null, null, Guid.NewGuid(), Guid.NewGuid(), null,
            null, "wrong", "wrong", "wrong", null, null, null, null, false, [], []);
        await service.RouteAsync(source.Id, source.Version, "Tarefa", command, Actor("serviceFollowup", "tasks"));
        var saved = ((TaskProxy)(object)tasks).Command!;
        Assert.Equal("123456", saved.CustomerCode); Assert.Equal("11999999999", saved.ClientWhatsApp);
        Assert.Contains("Não consigo salvar o pagamento", saved.Description); Assert.Contains(source.Id.ToString(), saved.ExternalLink);
    }
}
