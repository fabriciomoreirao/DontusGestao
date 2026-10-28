using System.Text.Json.Nodes;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class ServiceRequestProtocolTests
{
    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static WorkItem Item() => new() { Module = "serviceRequests", RecordType = "Chamado externo", Title = "Solicitação", Status = "Triagem", CreatedBy = "integracao-chamados" };
    private static JsonObject Detail() => new() { ["kind"] = "serviceRequest", ["clientId"] = "123456", ["selectedType"] = "Bug", ["aiClassification"] = "Desenvolvimento" };
    private static ServiceRequestCreationService Service(OperationsDbContext db, string time = "2026-10-28T12:00:00Z") => new(db, new Clock(DateTimeOffset.Parse(time)));

    [Fact]
    public async Task New_requests_receive_the_requested_sequence_in_records_history_and_audit()
    {
        await using var db = Context(); var service = Service(db);
        foreach (var expected in new[] { "C260001", "C260002", "C260003" })
        {
            var item = Item(); var protocol = await service.CreateAsync(item, Detail());
            Assert.Equal(expected, protocol); Assert.Equal(protocol, JsonNode.Parse(item.Description)!["protocol"]!.ToString());
            Assert.Contains(db.Activities, x => x.EntityId == item.Id && x.Summary.StartsWith(protocol));
            Assert.Contains(db.AuditEvents, x => x.ResourceId == item.Id.ToString() && x.DetailsJson.Contains(protocol));
        }
        Assert.Equal(3, (await db.ServiceRequestProtocolCounters.SingleAsync()).LastNumber);
    }

    [Fact]
    public async Task Counters_survive_new_contexts_and_deleting_requests_does_not_reuse_numbers()
    {
        await using var db = Context(); var item = Item();
        Assert.Equal("C260001", await Service(db).CreateAsync(item, Detail()));
        db.WorkItems.Remove(item); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        Assert.Equal("C260002", await Service(db).CreateAsync(Item(), Detail()));
    }

    [Fact]
    public async Task The_year_and_reset_follow_Brasilia_at_midnight()
    {
        await using var db = Context();
        Assert.Equal("C260001", await Service(db, "2027-01-01T02:59:59Z").CreateAsync(Item(), Detail()));
        Assert.Equal("C270001", await Service(db, "2027-01-01T03:00:00Z").CreateAsync(Item(), Detail()));
        Assert.Equal("C270002", await Service(db, "2027-01-01T03:00:01Z").CreateAsync(Item(), Detail()));
        Assert.Equal(2, await db.ServiceRequestProtocolCounters.CountAsync());
    }

    [Fact]
    public async Task The_sequence_continues_past_four_digits_and_legacy_protocols_remain_unchanged()
    {
        await using var db = Context(); db.ServiceRequestProtocolCounters.Add(new() { Year = 2026, LastNumber = 9999 });
        var legacy = Item(); legacy.Description = "{\"protocol\":\"CH-20261028-ABC123\"}"; db.WorkItems.Add(legacy); await db.SaveChangesAsync();
        Assert.Equal("C2610000", await Service(db).CreateAsync(Item(), Detail()));
        Assert.Equal("CH-20261028-ABC123", JsonNode.Parse(legacy.Description)!["protocol"]!.ToString());
    }

    [Fact]
    public async Task Other_modules_cannot_consume_a_service_request_number()
    {
        await using var db = Context(); var item = Item(); item.Module = "commercial";
        await Assert.ThrowsAsync<DomainException>(() => Service(db).CreateAsync(item, Detail())); Assert.Empty(db.ServiceRequestProtocolCounters);
    }
}
