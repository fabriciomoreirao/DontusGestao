using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CancellationResponsibilityTests
{
    private static readonly ActorContext Actor = new("gestor@dontus.local", "Gestor", "Gestão", "Gestão",
        [new EffectivePermission("cancellations", true, true, true, true, true)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static CreateWorkItemCommand Create(string description) => new("cancellations", "Solicitação de cancelamento", "Clínica", null, null, "CS", null, "P1", null, null, 10000, description, [], null, null, "Fila de espera");
    private const string Detail = """{"kind":"cancellationJourney","seller":"Vendedor","csOwner":"CS","reversalOwner":"Reversão"}""";

    [Theory]
    [InlineData("""{"kind":"cancellationJourney","csOwner":"CS"}""")]
    [InlineData("""{"kind":"cancellationJourney","reversalOwner":"   "}""")]
    [InlineData("""{"kind":"cancellationJourney","reversalOwner":null}""")]
    [InlineData("""{"kind":"cancellationJourney","reversalOwner":123}""")]
    public async Task Missing_reversal_responsibility_is_rejected_before_allocating_a_protocol(string detail)
    {
        await using var db = Context();
        var error = await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).CreateWorkItemAsync(Create(detail), Actor));
        Assert.Contains("responsável pela reversão", error.Message);
        Assert.Empty(db.WorkItems); Assert.Empty(db.CancellationProtocolCounters); Assert.Empty(db.AuditEvents);
    }

    [Fact]
    public async Task Assignment_updates_the_card_owner_without_changing_seller_or_cs_and_comments_preserve_it()
    {
        await using var db = Context(); var service = new OperationsService(db);
        var id = await service.CreateWorkItemAsync(Create(Detail), Actor); var item = await db.WorkItems.SingleAsync();
        Assert.Equal("Reversão", item.Owner);
        var data = JsonNode.Parse(item.Description)!; var protocol = data["protocol"]!.ToString();
        data["reversalOwner"] = "Nova reversão";
        await service.UpdateWorkItemAsync(new(id, item.Title, "CS", 10000, data.ToJsonString(), null, null, item.Version), Actor);
        Assert.Equal("Nova reversão", item.Owner);
        data = JsonNode.Parse(item.Description)!;
        Assert.Equal("Vendedor", data["seller"]!.ToString()); Assert.Equal("CS", data["csOwner"]!.ToString());
        data["csOwner"] = "Novo CS";
        await service.UpdateWorkItemAsync(new(id, item.Title, "Novo CS", 10000, data.ToJsonString(), null, null, item.Version), Actor);
        Assert.Equal("Nova reversão", item.Owner);
        await service.UpdateWorkItemAsync(new(id, item.Title, "Outro", 10000, """{"kind":"cancellationJourney","notes":"Contato realizado"}""", null, null, item.Version), Actor);
        data = JsonNode.Parse(item.Description)!;
        Assert.Equal("Nova reversão", item.Owner); Assert.Equal("Nova reversão", data["reversalOwner"]!.ToString());
        Assert.Equal("Vendedor", data["seller"]!.ToString()); Assert.Equal("Novo CS", data["csOwner"]!.ToString()); Assert.Equal(protocol, data["protocol"]!.ToString());
    }

    [Fact]
    public async Task Legacy_cards_keep_their_saved_assignee_and_cannot_clear_it()
    {
        await using var db = Context();
        var item = new WorkItem { Module = "cancellations", RecordType = "Solicitação de cancelamento", Title = "Clínica", Status = "Fila de espera", Owner = "Responsável antigo", Description = """{"kind":"cancellationJourney","seller":"Vendedor","csOwner":"CS","protocol":"C260001"}""", CreatedBy = Actor.Email };
        db.WorkItems.Add(item); await db.SaveChangesAsync(); var service = new OperationsService(db);
        await service.UpdateWorkItemAsync(new(item.Id, item.Title, "CS", 0, """{"kind":"cancellationJourney","notes":"Contato"}""", null, null, item.Version), Actor);
        Assert.Equal("Responsável antigo", item.Owner); Assert.Equal("Responsável antigo", JsonNode.Parse(item.Description)!["reversalOwner"]!.ToString());
        var version = item.Version;
        await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(new(item.Id, item.Title, "", 0, """{"kind":"cancellationJourney","reversalOwner":""}""", null, null, version), Actor));
        Assert.Equal(version, item.Version); Assert.Equal("Responsável antigo", item.Owner);
    }
}
