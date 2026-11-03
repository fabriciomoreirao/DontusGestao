using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class OperationsResponseProjectionTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static readonly ActorContext Actor = new("test@dontus.local", "Teste", "Colaborador", "Marketing", [new("marketing", true, false, true, false, false)]);
    private static WorkItem Item(string module = "marketing") => new() { Module = module, RecordType = "Solicitação", Title = "Teste", Status = "Novo", CreatedBy = "teste" };

    [Fact]
    public async Task Unchanged_attachments_are_not_retransmitted_and_legacy_clients_keep_full_snapshots()
    {
        await using var db = Context(); var item = Item(); item.Description = new string('a', 2_000_000); db.WorkItems.Add(item); await db.SaveChangesAsync();
        var snapshot = await new OperationsService(db).GetSnapshotAsync(Actor);
        Assert.Same(snapshot, OperationsResponseProjection.Create(snapshot, null));
        var response = Assert.IsType<Dictionary<string, object?>>(OperationsResponseProjection.Create(snapshot, new Dictionary<Guid, long> { [item.Id] = item.Version }));
        Assert.False(response.ContainsKey("items")); Assert.Empty(Assert.IsType<WorkItemDto[]>(response["updatedItems"]));
        Assert.True(JsonSerializer.Serialize(response).Length < 10_000);
        Assert.Equal(item.Description, Assert.Single(snapshot.Items).Description);
    }

    [Fact]
    public async Task Versions_only_filter_authorized_records_and_remove_hidden_or_deleted_records()
    {
        await using var db = Context(); var unchanged = Item(); var updated = Item(); var created = Item(); var hidden = Item("hr");
        db.WorkItems.AddRange(unchanged, updated, created, hidden); await db.SaveChangesAsync();
        var deleted = Guid.NewGuid();
        var known = new Dictionary<Guid, long> { [unchanged.Id] = unchanged.Version, [updated.Id] = updated.Version - 1, [hidden.Id] = hidden.Version, [deleted] = 1 };
        var snapshot = await new OperationsService(db).GetSnapshotAsync(Actor);
        var response = Assert.IsType<Dictionary<string, object?>>(OperationsResponseProjection.Create(snapshot, known));
        var changed = Assert.IsType<WorkItemDto[]>(response["updatedItems"]);
        Assert.Equal(2, changed.Length); Assert.Contains(changed, item => item.Id == updated.Id); Assert.Contains(changed, item => item.Id == created.Id);
        Assert.DoesNotContain(changed, item => item.Id == hidden.Id);
        var removed = Assert.IsType<Guid[]>(response["removedItemIds"]); Assert.Contains(hidden.Id, removed); Assert.Contains(deleted, removed);
    }
}
