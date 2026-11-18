using System.Reflection;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Dontus.Operations.Tests;

public sealed class OperationsWorkspaceCacheTests
{
    private static ActorContext Actor(string email = "one@test.local") => new(email, email, "Colaborador", "Suporte",
        [new EffectivePermission("dashboard", true, false, false, false, false)]);
    private static OperationsSnapshot Snapshot(ActorContext actor) => new(
        new UserDto(actor.Email, actor.DisplayName, actor.Role, actor.Department, "", "", false, actor.Permissions!, false, null),
        [], [], [], [], [], [], []);

    [Fact]
    public async Task Concurrent_requests_share_a_build_and_entries_are_private_to_session_and_permissions()
    {
        var calls = 0;
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var operations = DispatchProxy.Create<IOperationsService, SnapshotProxy>();
        ((SnapshotProxy)operations).Load = async actor => { Interlocked.Increment(ref calls); await ready.Task; return Snapshot(actor); };
        using var services = new ServiceCollection().AddScoped(_ => operations).BuildServiceProvider();
        var broker = new RealtimeBroker(); broker.SetAvailable(true);
        using var cache = new OperationsWorkspaceCache(services.GetRequiredService<IServiceScopeFactory>(), broker);
        var actor = Actor(); var identity = new AuthenticatedIdentity(actor.Email, actor.DisplayName) { SessionId = Guid.NewGuid() };
        var requests = Enumerable.Range(0, 12).Select(_ => cache.GetAsync(identity, actor)).ToArray();
        Assert.Equal(1, calls);
        ready.SetResult();
        var results = await Task.WhenAll(requests).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.All(results, result => Assert.Same(results[0], result));
        Assert.Same(results[0], await cache.GetAsync(identity, actor));
        await cache.GetAsync(identity with { SessionId = Guid.NewGuid() }, actor);
        await cache.GetAsync(identity, Actor("two@test.local"));
        await cache.GetAsync(identity, actor with { Permissions = [new("dashboard", true, true, false, false, false)] });
        Assert.Equal(4, calls);
        broker.Publish("""{"topic":"operations"}""");
        Assert.NotSame(results[0], await cache.GetAsync(identity, actor));
        Assert.Equal(5, calls);
        broker.SetAvailable(false);
        await cache.GetAsync(identity, actor); await cache.GetAsync(identity, actor);
        Assert.Equal(7, calls);
    }

    [Fact]
    public async Task Full_and_delta_responses_never_share_cache_entries_or_serialize_unchanged_records()
    {
        var operations = DispatchProxy.Create<IOperationsService, SnapshotProxy>();
        ((SnapshotProxy)operations).Load = actor => Task.FromResult(Snapshot(actor));
        using var services = new ServiceCollection().AddScoped(_ => operations).BuildServiceProvider();
        var broker = new RealtimeBroker(); broker.SetAvailable(true);
        using var cache = new OperationsWorkspaceCache(services.GetRequiredService<IServiceScopeFactory>(), broker);
        var actor = Actor(); var identity = new AuthenticatedIdentity(actor.Email, actor.DisplayName) { SessionId = Guid.NewGuid() };
        var full = await cache.GetAsync(identity, actor);
        var removed = Guid.NewGuid(); var known = new Dictionary<Guid, long> { [removed] = 1 };
        var delta = await cache.GetAsync(identity, actor, known);
        Assert.NotSame(full, delta);
        Assert.Contains("\"items\":", System.Text.Encoding.UTF8.GetString(full.Json));
        using var json = System.Text.Json.JsonDocument.Parse(delta.Json);
        Assert.False(json.RootElement.TryGetProperty("items", out _));
        Assert.Empty(json.RootElement.GetProperty("updatedItems").EnumerateArray());
        Assert.Equal(removed, Assert.Single(json.RootElement.GetProperty("removedItemIds").EnumerateArray()).GetGuid());
        Assert.Same(full, await cache.GetAsync(identity, actor));
        Assert.Same(delta, await cache.GetAsync(identity, actor, known));
    }

    [Fact]
    public async Task A_disconnected_waiter_does_not_cancel_another_tab_and_failed_builds_can_be_retried()
    {
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var operations = DispatchProxy.Create<IOperationsService, SnapshotProxy>();
        ((SnapshotProxy)operations).Load = async actor => { await ready.Task; return Snapshot(actor); };
        using var services = new ServiceCollection().AddScoped(_ => operations).BuildServiceProvider();
        var broker = new RealtimeBroker(); broker.SetAvailable(true);
        using var cache = new OperationsWorkspaceCache(services.GetRequiredService<IServiceScopeFactory>(), broker);
        var actor = Actor(); var identity = new AuthenticatedIdentity(actor.Email, actor.DisplayName) { SessionId = Guid.NewGuid() };
        using var disconnected = new CancellationTokenSource();
        var first = cache.GetAsync(identity, actor, ct: disconnected.Token);
        var second = cache.GetAsync(identity, actor);
        disconnected.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        ready.SetResult();
        Assert.Contains(actor.Email, System.Text.Encoding.UTF8.GetString((await second.WaitAsync(TimeSpan.FromSeconds(5))).Json));
        broker.InvalidateOperations();
        ((SnapshotProxy)operations).Load = _ => Task.FromException<OperationsSnapshot>(new InvalidOperationException("temporary"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => cache.GetAsync(identity, actor));
        ((SnapshotProxy)operations).Load = value => Task.FromResult(Snapshot(value));
        Assert.Contains(actor.Email, System.Text.Encoding.UTF8.GetString((await cache.GetAsync(identity, actor)).Json));
    }

    [Fact]
    public void Chat_and_presence_do_not_advance_the_operational_cursor_but_listener_reconnects_do()
    {
        var broker = new RealtimeBroker(); broker.SetAvailable(true);
        var cursor = broker.OperationsCursor;
        broker.Publish($$"""{"topic":"chat","userId":"{{Guid.NewGuid()}}"}""");
        Assert.Equal(cursor, broker.OperationsCursor);
        broker.SetAvailable(false); Assert.NotEqual(cursor, broker.OperationsCursor);
        cursor = broker.OperationsCursor;
        broker.SetAvailable(true); Assert.NotEqual(cursor, broker.OperationsCursor);
    }

    [Fact]
    public async Task Saved_operational_changes_invalidate_locally_before_the_database_notification_arrives()
    {
        var broker = new RealtimeBroker(); broker.SetAvailable(true);
        await using var db = new OperationsDbContext(new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options, broker);
        var cursor = broker.OperationsCursor;
        db.WorkItems.Add(new WorkItem { Module = "support", Title = "Novo", RecordType = "Atendimento", Status = "Pendente", CreatedBy = "test@local" });
        await db.SaveChangesAsync(); Assert.NotEqual(cursor, broker.OperationsCursor);
        cursor = broker.OperationsCursor;
        db.LocalAuthSessions.Add(new LocalAuthSession { UserId = Guid.NewGuid(), TokenHash = "test", ExpiresAt = DateTimeOffset.UtcNow.AddHours(1) });
        await db.SaveChangesAsync(); Assert.Equal(cursor, broker.OperationsCursor);
    }

    public class SnapshotProxy : DispatchProxy
    {
        public Func<ActorContext, Task<OperationsSnapshot>> Load { get; set; } = null!;
        protected override object? Invoke(MethodInfo? method, object?[]? args) =>
            method?.Name == nameof(IOperationsService.GetSnapshotAsync) ? Load((ActorContext)args![0]!) : throw new NotSupportedException(method?.Name);
    }
}
