using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Dontus.Operations.Application;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace Dontus.Operations.Infrastructure;

public sealed record CachedOperationsWorkspace(byte[] Json, string Cursor, string OperationsCursor);

/// <summary>Private, bounded cache. Parallel callers share one build per session and database revision.</summary>
public sealed class OperationsWorkspaceCache(IServiceScopeFactory scopes, RealtimeBroker realtime) : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 64 * 1024 * 1024 });
    private readonly ConcurrentDictionary<string, Lazy<Task<CachedOperationsWorkspace>>> inFlight = new();

    public async Task<CachedOperationsWorkspace> GetAsync(AuthenticatedIdentity identity, ActorContext actor,
        IReadOnlyDictionary<Guid, long>? knownVersions = null, CancellationToken ct = default)
    {
        var cursor = realtime.Cursor;
        var operationsCursor = realtime.OperationsCursor;
        // Include the server authorization in addition to the session ID: cache entries cannot cross users or grants.
        var authorization = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(actor)));
        var versions = knownVersions is null ? "full" : Convert.ToHexString(SHA256.HashData(
            JsonSerializer.SerializeToUtf8Bytes(knownVersions.OrderBy(entry => entry.Key))));
        var key = $"{identity.SessionId}:{authorization}:{cursor}:{versions}";
        if (realtime.Available && cache.TryGetValue<CachedOperationsWorkspace>(key, out var existing)) return existing!;
        var pending = inFlight.GetOrAdd(key, _ => new Lazy<Task<CachedOperationsWorkspace>>(async () =>
        {
            // A disconnected tab must not cancel the build shared with another tab.
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            var snapshot = await BuildAsync(actor, knownVersions, timeout.Token);
            var result = new CachedOperationsWorkspace(JsonSerializer.SerializeToUtf8Bytes(
                OperationsResponseProjection.Create(snapshot, knownVersions), JsonOptions), cursor, operationsCursor);
            if (realtime.Available && realtime.Cursor == cursor)
                cache.Set(key, result, new MemoryCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30),
                    Size = Math.Max(1, result.Json.LongLength),
                });
            return result;
        }));
        var task = pending.Value;
        _ = task.ContinueWith(_ => inFlight.TryRemove(KeyValuePair.Create(key, pending)),
            CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        return await task.WaitAsync(ct);
    }

    private async Task<OperationsSnapshot> BuildAsync(ActorContext actor, IReadOnlyDictionary<Guid, long>? knownVersions, CancellationToken ct)
    {
        // Each projection owns its DbContext; EF contexts must never run concurrent queries.
        using var parallelism = new SemaphoreSlim(4);
        async Task<TResult?> Load<TService, TResult>(bool allowed, Func<TService, Task<TResult>> load) where TService : notnull where TResult : class
        {
            if (!allowed) return null;
            await parallelism.WaitAsync(ct);
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                return await load(scope.ServiceProvider.GetRequiredService<TService>());
            }
            finally { parallelism.Release(); }
        }
        var snapshot = Load<IOperationsService, OperationsSnapshot>(true, service => service.GetSnapshotAsync(actor, ct, knownWorkItemVersions: knownVersions));
        var diary = Load<IOperationsService, DiaryModuleDto>(actor.HasPermission("diary", "view"), service => service.GetDiaryModuleAsync(actor, ct));
        var notes = Load<IOperationsService, NotesModuleDto>(actor.HasPermission("notes", "view"), service => service.GetNotesModuleAsync(actor, ct));
        var agenda = Load<IAgendaService, AgendaModuleDto>(actor.HasPermission("work", "view"), service => service.GetModuleAsync(actor, ct));
        var suggestions = Load<ISuggestionService, SuggestionModuleDto>(actor.HasPermission("suggestions", "view"), service => service.GetModuleAsync(actor, ct));
        var tasks = Load<ITaskService, TaskModuleDto>(actor.HasPermission("tasks", "view") || actor.HasPermission("catalogs", "view") || actor.HasPermission("ti", "view"), service => service.GetModuleAsync(actor, ct));
        var chat = Load<IInternalChatService, InternalChatModuleDto>(actor.HasPermission("internalChat", "view"), service => service.GetModuleAsync(actor, ct));
        var notices = Load<IOperationsService, NoticesModuleDto>(actor.HasPermission("notices", "view"), service => service.GetNoticesModuleAsync(actor, ct));
        var customers = Load<IOperationsService, CustomerModuleDto>(OperationsProjectionPolicy.CanViewCustomerCatalogs(actor), service => service.GetCustomerModuleAsync(actor, ct));
        var access = Load<IAccessControlService, AccessManagementDto>(actor.HasPermission("admin", "manage"), service => service.GetManagementAsync(actor, ct));
        await Task.WhenAll(snapshot, diary, notes, agenda, suggestions, tasks, chat, notices, customers, access);
        return (await snapshot)! with
        {
            DiaryModule = await diary, NotesModule = await notes, AgendaModule = await agenda,
            SuggestionModule = await suggestions, TaskModule = await tasks, InternalChatModule = await chat,
            NoticesModule = await notices, CustomerModule = await customers, Access = await access,
        };
    }

    public void Dispose() => cache.Dispose();
}
