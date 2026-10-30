using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CancellationProtocolTests
{
    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private static readonly ActorContext Actor = new("gestor@dontus.local", "Gestor", "Gestão", "Gestão",
        [new EffectivePermission("cancellations", true, true, true, true, true)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static WorkItem Item() => new() { Module = "cancellations", RecordType = "Solicitação de cancelamento",
        Title = "Clínica", Status = "Fila de espera", Description = """{"kind":"cancellationJourney","clientId":"123456","protocol":"C269999"}""", CreatedBy = Actor.Email };
    private static CancellationProtocolService Service(OperationsDbContext db, string time = "2026-10-30T12:00:00Z") => new(db, new Clock(DateTimeOffset.Parse(time)));
    private static string Protocol(WorkItem item) => JsonNode.Parse(item.Description)!["protocol"]!.ToString();

    [Fact]
    public async Task Assigns_sequential_protocols_on_the_server_and_records_them_in_history_and_audit()
    {
        await using var db = Context();
        foreach (var expected in new[] { "C260001", "C260002", "C260003" })
        {
            var item = Item();
            Assert.Equal(expected, await Service(db).CreateAsync(item, Actor));
            Assert.Equal(expected, Protocol(item));
            Assert.Contains(db.Activities, entry => entry.EntityId == item.Id && entry.Summary.StartsWith(expected));
            Assert.Contains(db.AuditEvents, entry => entry.ResourceId == item.Id.ToString() && entry.DetailsJson.Contains(expected));
        }
        Assert.Equal(3, (await db.CancellationProtocolCounters.SingleAsync()).LastNumber);
        Assert.Empty(db.ServiceRequestProtocolCounters);
    }

    [Fact]
    public async Task Deletion_and_a_new_context_do_not_reuse_protocols()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new OperationsDbContext(options);
        var item = Item();
        Assert.Equal("C260001", await Service(db).CreateAsync(item, Actor));
        db.WorkItems.Remove(item); await db.SaveChangesAsync();
        await using var next = new OperationsDbContext(options);
        Assert.Equal("C260002", await Service(next).CreateAsync(Item(), Actor));
    }

    [Fact]
    public async Task Resets_at_the_start_of_the_year_in_Brasilia_and_supports_more_than_four_digits()
    {
        await using var db = Context();
        Assert.Equal("C260001", await Service(db, "2027-01-01T02:59:59Z").CreateAsync(Item(), Actor));
        Assert.Equal("C270001", await Service(db, "2027-01-01T03:00:00Z").CreateAsync(Item(), Actor));
        var counter = await db.CancellationProtocolCounters.SingleAsync(entry => entry.Year == 2027);
        counter.LastNumber = 9999; await db.SaveChangesAsync();
        Assert.Equal("C2710000", await Service(db, "2027-01-01T03:00:01Z").CreateAsync(Item(), Actor));
    }

    [Fact]
    public async Task Normal_creation_assigns_a_protocol_and_updates_cannot_overwrite_or_remove_it()
    {
        await using var db = Context();
        var service = new OperationsService(db);
        var id = await service.CreateWorkItemAsync(new CreateWorkItemCommand("cancellations", "Solicitação de cancelamento",
            "Clínica", null, null, null, null, "P1", null, null, 0, Item().Description, [], null, null, "Fila de espera"), Actor);
        var item = await db.WorkItems.SingleAsync(entry => entry.Id == id);
        var protocol = Protocol(item);
        Assert.Matches(@"^C\d{2}0001$", protocol);
        foreach (var detail in new[] { """{"kind":"cancellationJourney","notes":"Contato realizado"}""",
            """{"kind":"cancellationJourney","protocol":"C269999","notes":"Proposta"}""" })
        {
            await service.UpdateWorkItemAsync(new UpdateWorkItemCommand(id, item.Title, item.Owner, 0, detail, null, null, item.Version), Actor);
            Assert.Equal(protocol, Protocol(item));
        }
        Assert.Equal("Proposta", JsonNode.Parse(item.Description)!["notes"]!.ToString());
        Assert.Equal(1, (await db.CancellationProtocolCounters.SingleAsync()).LastNumber);
    }

    [Fact]
    public async Task Invalid_or_unauthorized_requests_do_not_consume_a_number()
    {
        await using var db = Context();
        var invalid = Item(); invalid.Description = "inválido";
        await Assert.ThrowsAsync<DomainException>(() => Service(db).CreateAsync(invalid, Actor));
        var wrongModule = Item(); wrongModule.Module = "serviceRequests";
        await Assert.ThrowsAsync<DomainException>(() => Service(db).CreateAsync(wrongModule, Actor));
        var denied = Actor with { Permissions = [] };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).CreateWorkItemAsync(
            new CreateWorkItemCommand("cancellations", "Solicitação de cancelamento", "Clínica", null, null, null, null,
                "P1", null, null, 0, Item().Description, [], null, null), denied))).StatusCode);
        Assert.Empty(db.CancellationProtocolCounters);
    }
}
