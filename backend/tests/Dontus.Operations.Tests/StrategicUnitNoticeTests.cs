using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class StrategicUnitNoticeTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Viewer => new("cs@test", "CS", "Colaborador", "CS", [new EffectivePermission("cs", true, false, false, false, false)]);
    private static WorkItem Network() => new()
    {
        Module = "cs",
        Title = "Rede",
        Status = "Ativo",
        RecordType = "Conta estratégica",
        CreatedBy = "tests",
        Description = """{"kind":"enterpriseNetwork","units":[{"id":"one","pendingFollowUp":true},{"id":"two","pendingFollowUp":true}],"history":[{"type":"Reunião","text":"Preservar"}]}"""
    };

    [Fact]
    public async Task Embedded_followup_evolves_and_finishes_without_creating_another_work_item()
    {
        await using var db = Context();
        var network = Network(); network.Owner = "CS"; db.Add(network); await db.SaveChangesAsync();
        var service = new OperationsService(db);
        var actor = Viewer with { Permissions = [new EffectivePermission("cs", true, false, true, false, false)] };
        foreach (var phase in new[] { "tracking", "conference", "finished" })
        {
            var document = JsonNode.Parse(network.Description)!;
            var unit = document["units"]![0]!;
            unit["followUp"] = new JsonObject
            {
                ["kind"] = "csJourney", ["track"] = "activation", ["phase"] = phase,
                ["featuresBase"] = new JsonArray("Agenda"), ["featuresActive"] = new JsonArray("Agenda"),
                ["follows"] = new JsonArray(new JsonObject { ["text"] = "Evolução preservada", ["createdAt"] = "2026-11-25T15:00:00Z" })
            };
            unit["followUpOwner"] = "CS";
            unit["status"] = phase == "finished" ? "Finalizado" : "Em acompanhamento";
            await service.UpdateWorkItemAsync(new(network.Id, network.Title, network.Owner, 0, document.ToJsonString(), null, null, network.Version), actor);
            Assert.Single(await db.WorkItems.ToArrayAsync());
            Assert.Equal(phase, JsonNode.Parse(network.Description)!["units"]![0]!["followUp"]!["phase"]!.ToString());
        }
        db.ChangeTracker.Clear();
        var saved = JsonNode.Parse((await db.WorkItems.SingleAsync()).Description)!;
        Assert.Equal("Finalizado", saved["units"]![0]!["status"]!.ToString());
        Assert.Equal("Evolução preservada", saved["units"]![0]!["followUp"]!["follows"]![0]!["text"]!.ToString());
    }

    [Fact]
    public async Task Opening_one_unit_persists_only_its_notice_and_does_not_create_an_interaction()
    {
        await using var db = Context();
        var network = Network(); db.Add(network); await db.SaveChangesAsync();
        var service = new OperationsService(db);
        await service.AcknowledgeStrategicUnitAsync(network.Id, "one", Viewer);
        var version = network.Version;
        await service.AcknowledgeStrategicUnitAsync(network.Id, "one", Viewer);
        Assert.Equal(version, network.Version);
        db.ChangeTracker.Clear();
        var saved = JsonNode.Parse((await db.WorkItems.SingleAsync()).Description)!;
        Assert.False(saved["units"]![0]!["pendingFollowUp"]!.GetValue<bool>());
        Assert.True(saved["units"]![1]!["pendingFollowUp"]!.GetValue<bool>());
        Assert.Single(saved["history"]!.AsArray());
        Assert.Equal("Preservar", saved["history"]![0]!["text"]!.ToString());
    }

    [Fact]
    public async Task Linking_a_customer_adds_a_unit_with_a_pending_notice()
    {
        await using var db = Context(); var network = Network(); db.Add(network); await db.SaveChangesAsync();
        var actor = Viewer with { Permissions = [new EffectivePermission("cs", true, true, false, false, false)] };
        var service = new OperationsService(db);
        var customerId = await service.CreateCustomerAsync(new CreateCustomerCommand(
            "Clínica Teste", "Unidade nova", "123456", null, null, null, 1, 0, true, network.Id,
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null), actor);
        db.ChangeTracker.Clear();
        var units = JsonNode.Parse((await db.WorkItems.SingleAsync()).Description)!["units"]!.AsArray();
        var unit = Assert.Single(units, entry => entry?["customerId"]?.ToString() == customerId.ToString());
        Assert.True(unit!["pendingFollowUp"]!.GetValue<bool>());
        Assert.Empty(unit["features"]!.AsArray());
    }

    [Fact]
    public async Task Notice_requires_cs_access_and_a_unit_from_the_selected_network()
    {
        await using var db = Context(); var network = Network(); db.Add(network); await db.SaveChangesAsync();
        var service = new OperationsService(db);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.AcknowledgeStrategicUnitAsync(network.Id, "one", Viewer with { Permissions = [] }))).StatusCode);
        Assert.Equal(404, (await Assert.ThrowsAsync<DomainException>(() => service.AcknowledgeStrategicUnitAsync(network.Id, "missing", Viewer))).StatusCode);
        Assert.True(JsonNode.Parse(network.Description)!["units"]![0]!["pendingFollowUp"]!.GetValue<bool>());
    }
}
