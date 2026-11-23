using System.Collections.Concurrent;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;
using Dontus.Operations.Infrastructure.Redis;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;

namespace Dontus.Operations.Tests;

/// <summary>
/// "fake" roda sempre. "redis" só roda com a variável DONTUS_TEST_REDIS (ex.: 127.0.0.1:56379); sem ela o caso passa sem testar.
/// </summary>
public sealed class LocalSessionCacheTests
{
    private static readonly string? RedisForTests = Environment.GetEnvironmentVariable("DONTUS_TEST_REDIS");

    public static TheoryData<string> Caches => new() { "fake", "redis" };

    [Theory, MemberData(nameof(Caches))]
    public async Task Resolved_session_is_served_from_cache_without_reading_the_database_again(string kind)
    {
        if (CreateCache(kind) is not { } cache) return;
        var (db, auth, _, _, _, session) = await SetupAsync(cache);

        Assert.NotNull(await auth.ResolveSessionAsync(session.Token));
        await RevokeDirectlyInDatabaseAsync(db);

        // A sessão foi revogada direto no banco, sem passar pela API: só o cache explica ela continuar válida.
        var cached = await auth.ResolveSessionAsync(session.Token);
        Assert.NotNull(cached);
        Assert.Equal(session.Email, cached.Email);
        Assert.Equal(session.Email, cached.SessionActor!.Email);
    }

    [Theory, MemberData(nameof(Caches))]
    public async Task Sign_out_removes_the_session_from_cache(string kind)
    {
        if (CreateCache(kind) is not { } cache) return;
        var (_, auth, _, _, _, session) = await SetupAsync(cache);
        Assert.NotNull(await auth.ResolveSessionAsync(session.Token));

        await auth.SignOutAsync(session.Token);

        Assert.Null(await auth.ResolveSessionAsync(session.Token));
    }

    [Theory, MemberData(nameof(Caches))]
    public async Task Password_recovery_removes_the_user_sessions_from_cache(string kind)
    {
        if (CreateCache(kind) is not { } cache) return;
        var (_, auth, _, _, _, session) = await SetupAsync(cache);
        Assert.NotNull(await auth.ResolveSessionAsync(session.Token));

        await auth.RequestPasswordRecoveryAsync(session.Email);

        Assert.Null(await auth.ResolveSessionAsync(session.Token));
    }

    [Theory, MemberData(nameof(Caches))]
    public async Task Blocking_the_user_removes_the_user_sessions_from_cache(string kind)
    {
        if (CreateCache(kind) is not { } cache) return;
        var (db, auth, access, actor, userId, session) = await SetupAsync(cache);
        Assert.NotNull(await auth.ResolveSessionAsync(session.Token));

        await access.UpdateUserAsync(new(userId, session.Email, session.DisplayName, "Suporte", false, []), actor);
        db.ChangeTracker.Clear();

        Assert.Null(await auth.ResolveSessionAsync(session.Token));
    }

    [Theory, MemberData(nameof(Caches))]
    public async Task Entry_read_before_an_invalidation_is_not_stored(string kind)
    {
        if (CreateCache(kind) is not { } cache) return;
        var (hash, entry) = NewEntry(TimeSpan.FromHours(1));

        var generation = await cache.GetGenerationAsync();
        await cache.RemoveUserAsync(entry.UserId); // bloqueio chegou enquanto o banco era consultado
        await cache.SetAsync(hash, entry, generation!.Value, DateTimeOffset.UtcNow);
        Assert.Null(await cache.GetAsync(hash));

        await cache.SetAsync(hash, entry, (await cache.GetGenerationAsync())!.Value, DateTimeOffset.UtcNow);
        var stored = await cache.GetAsync(hash);
        Assert.Equal(entry.SessionId, stored?.SessionId);
        Assert.Equal(entry.Actor.Email, stored?.Actor.Email);
        await cache.RemoveUserAsync(entry.UserId);
        Assert.Null(await cache.GetAsync(hash));
    }

    [Theory, MemberData(nameof(Caches))]
    public async Task Entry_is_not_stored_for_an_expired_session(string kind)
    {
        if (CreateCache(kind) is not { } cache) return;
        var (hash, entry) = NewEntry(TimeSpan.FromSeconds(-1));

        await cache.SetAsync(hash, entry, (await cache.GetGenerationAsync())!.Value, DateTimeOffset.UtcNow);

        Assert.Null(await cache.GetAsync(hash));
    }

    [Fact]
    public async Task Login_keeps_working_from_the_database_when_redis_is_down()
    {
        // Porta sem nenhum Redis: toda operação do cache falha.
        using var redis = await ConnectionMultiplexer.ConnectAsync(RedisLocalSessionCache.CreateOptions("127.0.0.1:1,connectTimeout=300"));
        var cache = new RedisLocalSessionCache(redis, NullLogger<RedisLocalSessionCache>.Instance);
        var (_, auth, access, actor, userId, session) = await SetupAsync(cache);

        Assert.Null(await cache.GetGenerationAsync());
        Assert.NotNull(await auth.ResolveSessionAsync(session.Token));
        Assert.NotNull(await auth.ResolveSessionAsync(session.Token));

        await access.UpdateUserAsync(new(userId, session.Email, session.DisplayName, "Suporte", false, []), actor);
        Assert.Null(await auth.ResolveSessionAsync(session.Token));
    }

    private static ILocalSessionCache? CreateCache(string kind) => kind switch
    {
        "fake" => new FakeLocalSessionCache(),
        "redis" when !string.IsNullOrWhiteSpace(RedisForTests) => new RedisLocalSessionCache(
            ConnectionMultiplexer.Connect(RedisLocalSessionCache.CreateOptions(RedisForTests)), NullLogger<RedisLocalSessionCache>.Instance),
        _ => null,
    };

    private static (string Hash, CachedLocalSession Entry) NewEntry(TimeSpan expiresIn) =>
        (Guid.NewGuid().ToString("N"), new CachedLocalSession(Guid.NewGuid(), Guid.NewGuid(), "a@example.com", "A", "",
            DateTimeOffset.UtcNow.Add(expiresIn), new ActorContext("a@example.com", "A", "", "", [])));

    private static async Task RevokeDirectlyInDatabaseAsync(OperationsDbContext db)
    {
        foreach (var entry in await db.LocalAuthSessions.ToListAsync()) entry.RevokedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
    }

    private static async Task<(OperationsDbContext Db, LocalAuthenticationService Auth, AccessControlService Access,
        ActorContext Actor, Guid UserId, LocalLoginResult Session)> SetupAsync(ILocalSessionCache cache)
    {
        var db = new OperationsDbContext(new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var sender = new RecordingPasswordEmailSender();
        var access = new AccessControlService(db, new ConfigurationBuilder().Build(), sender, sessionCache: cache);
        await access.InitializeAsync();
        var admin = await db.Users.SingleAsync();
        var actor = await access.ResolveActorAsync(new(admin.Email, admin.DisplayName));
        var userId = await access.CreateUserAsync(new("cache.user@example.com", "Usuário cache", "Suporte", true, []), actor);
        var password = Assert.Single(sender.Messages).Password;
        var auth = new LocalAuthenticationService(db, sender, access, sessionCache: cache);
        var session = await auth.LoginAsync("cache.user@example.com", password);
        db.ChangeTracker.Clear();
        return (db, auth, access, actor, userId, session);
    }

    /// <summary>Mesmo contrato do Redis, em memória, para os testes rodarem sem Redis.</summary>
    private sealed class FakeLocalSessionCache : ILocalSessionCache
    {
        private readonly ConcurrentDictionary<string, CachedLocalSession> sessions = new();
        private long generation;

        public Task<CachedLocalSession?> GetAsync(string tokenHash) =>
            Task.FromResult(sessions.TryGetValue(tokenHash, out var session) ? session : null);

        public Task<long?> GetGenerationAsync() => Task.FromResult<long?>(Interlocked.Read(ref generation));

        public Task SetAsync(string tokenHash, CachedLocalSession session, long observedGeneration, DateTimeOffset now)
        {
            if (session.ExpiresAt > now && Interlocked.Read(ref generation) == observedGeneration) sessions[tokenHash] = session;
            return Task.CompletedTask;
        }

        public Task RemoveTokenAsync(string tokenHash)
        {
            Interlocked.Increment(ref generation);
            sessions.TryRemove(tokenHash, out _);
            return Task.CompletedTask;
        }

        public Task RemoveUserAsync(Guid userId)
        {
            Interlocked.Increment(ref generation);
            foreach (var entry in sessions.Where(entry => entry.Value.UserId == userId)) sessions.TryRemove(entry.Key, out _);
            return Task.CompletedTask;
        }
    }
}
