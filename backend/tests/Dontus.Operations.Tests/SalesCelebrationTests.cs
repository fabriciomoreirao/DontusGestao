using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class SalesCelebrationTests
{
    private static readonly ActorContext Actor = new("vendedor@test.local", "Vendedor", "Comercial", "Comercial", [new("commercial", true, true, true, true, true)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    [Fact]
    public async Task Only_a_successful_new_win_produces_an_event_and_distinct_cards_are_kept()
    {
        await using var db = Context(); var service = new OperationsService(db);
        for (var index = 0; index < 2; index++)
        {
            var id = await service.CreateWorkItemAsync(new("commercial", "Lead comercial", $"Clínica {index}", null, null, "Vendedor", "Comercial", "P1", null, null, 10000,
                """{"kind":"commercialLead","stage":"Proposta","clientId":"123456","customer":"Clínica teste","seller":"Vendedor"}""", [], null, null), Actor);
            var item = await db.WorkItems.SingleAsync(x => x.Id == id);
            var description = item.Description.Replace("Proposta", "Ganho");
            await service.UpdateWorkItemAsync(new(id, item.Title, item.Owner, 10000, description, null, null, item.Version), Actor);
            await service.UpdateWorkItemAsync(new(id, item.Title, item.Owner, 10000, description, null, null, item.Version), Actor);
        }
        var events = await SalesCelebrationService.RecentAsync(db, default);
        Assert.Equal(2, events.Count); Assert.Equal(2, events.Select(x => x.Id).Distinct().Count());
        Assert.All(events, entry => { Assert.Equal("Clínica teste", entry.CustomerName); Assert.Equal("123456", entry.ClientId); Assert.Equal("Vendedor", entry.Seller); });
        Assert.Equal(2, await db.AuditEvents.CountAsync(x => x.Action == SalesCelebrationService.AuditAction));
    }
    [Theory]
    [InlineData("Lead de retenção")]
    [InlineData("Lead de qualificação")]
    public void Other_commercial_flows_do_not_publish_sales(string type)
    {
        Assert.False(SalesCelebrationService.IsWon(new WorkItem { Module = "commercial", RecordType = type, Title = "Teste", Status = "Ganho", CreatedBy = Actor.Email }));
    }
    [Fact]
    public async Task Stale_updates_do_not_publish_events()
    {
        await using var db = Context();
        var item = new WorkItem { Module = "commercial", RecordType = "Lead comercial", Title = "Teste", Status = "Proposta", Description = """{"kind":"commercialLead","stage":"Proposta"}""", CreatedBy = Actor.Email };
        db.WorkItems.Add(item); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).UpdateWorkItemAsync(new(item.Id, item.Title, "Vendedor", 10000, """{"kind":"commercialLead","stage":"Ganho"}""", null, null, 999), Actor));
        Assert.Empty(await SalesCelebrationService.RecentAsync(db, default));
    }
}
