using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class OperationsResponseProjectionTests
{
    [Fact]
    public async Task Commercial_history_is_not_evicted_by_recent_activity_in_other_modules()
    {
        await using var db = Context();
        var sale = Item("commercial"); sale.RecordType = "Lead comercial"; sale.UpdatedAt = DateTimeOffset.UtcNow.AddYears(-1); sale.AmountCents = 12345;
        sale.Description = """{"kind":"commercialLead","stage":"Ganho","wonAt":"2025-11-01T12:00:00Z"}""";
        db.WorkItems.Add(sale);
        db.WorkItems.AddRange(Enumerable.Range(0, 1005).Select(_ => Item()));
        var hiddenSale = Item("commercial"); hiddenSale.Title = "Visível somente com acesso comercial"; db.WorkItems.Add(hiddenSale);
        await db.SaveChangesAsync();
        var actor = Actor with { Permissions = [new("marketing", true, false, false, false, false), new("commercial", true, false, false, false, false)] };
        var snapshot = await new OperationsService(db).GetSnapshotAsync(actor);
        Assert.Equal(1007, snapshot.Items.Count);
        Assert.Equal(12345, snapshot.Items.Single(item => item.Id == sale.Id).AmountCents);
        Assert.DoesNotContain((await new OperationsService(db).GetSnapshotAsync(Actor)).Items, item => item.Module == "commercial");
    }
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
    public async Task Known_versions_skip_large_descriptions_in_the_query_and_changed_records_keep_full_content()
    {
        await using var db = Context();
        var item = Item(); item.Description = new string('a', 2_000_000);
        var hidden = Item("hr"); hidden.Description = "Documento protegido";
        db.WorkItems.AddRange(item, hidden); await db.SaveChangesAsync();
        var known = new Dictionary<Guid, long> { [item.Id] = item.Version, [hidden.Id] = hidden.Version };
        var service = new OperationsService(db);
        var unchanged = await service.GetSnapshotAsync(Actor, knownWorkItemVersions: known);
        Assert.Equal("", Assert.Single(unchanged.Items).Description);
        var response = Assert.IsType<Dictionary<string, object?>>(OperationsResponseProjection.Create(unchanged, known));
        Assert.Empty(Assert.IsType<WorkItemDto[]>(response["updatedItems"]));
        Assert.Contains(hidden.Id, Assert.IsType<Guid[]>(response["removedItemIds"]));
        item.Version++; item.Description += " atualizado";
        await db.SaveChangesAsync();
        var changed = await service.GetSnapshotAsync(Actor, knownWorkItemVersions: known);
        Assert.Equal(item.Description, Assert.Single(changed.Items).Description);
        Assert.Equal(item.Description, Assert.Single((await service.GetSnapshotAsync(Actor)).Items).Description);
    }

    [Fact]
    public async Task Cached_commission_versions_cannot_skip_the_employee_identity_check()
    {
        await using var db = Context();
        var user = new AppUser { Email = Actor.Email, DisplayName = Actor.DisplayName, Department = "Marketing", CreatedBy = "test" };
        var own = Item("commissions"); own.Owner = user.DisplayName;
        own.Description = JsonSerializer.Serialize(new { employeeId = user.Id });
        var other = Item("commissions"); other.Owner = user.DisplayName;
        other.Description = JsonSerializer.Serialize(new { employeeId = Guid.NewGuid() });
        db.Users.Add(user); db.WorkItems.AddRange(own, other); await db.SaveChangesAsync();
        var known = new Dictionary<Guid, long> { [own.Id] = own.Version, [other.Id] = other.Version };
        var actor = Actor with { Permissions = [new("commissions", true, false, false, false, false)] };
        var snapshot = await new OperationsService(db).GetSnapshotAsync(actor, knownWorkItemVersions: known);
        Assert.Equal(own.Id, Assert.Single(snapshot.Items).Id);
        var response = Assert.IsType<Dictionary<string, object?>>(OperationsResponseProjection.Create(snapshot, known));
        Assert.Contains(other.Id, Assert.IsType<Guid[]>(response["removedItemIds"]));
        Assert.Empty(Assert.IsType<WorkItemDto[]>(response["updatedItems"]));
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
