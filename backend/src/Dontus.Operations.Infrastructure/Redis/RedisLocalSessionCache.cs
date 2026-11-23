using System.Text.Json;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace Dontus.Operations.Infrastructure.Redis;

/// <summary>
/// Sessões locais no Redis, por até 120 min. Se o Redis falhar, nada quebra: a autenticação consulta o banco.
/// Chaves: dontus:auth:session:{hash do token} (sessão), dontus:auth:user:{id} (tokens em cache do usuário)
/// e dontus:auth:generation (contador de invalidações).
/// </summary>
public sealed class RedisLocalSessionCache(IConnectionMultiplexer redis, ILogger<RedisLocalSessionCache> logger) : ILocalSessionCache
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(120);
    // O índice do usuário precisa durar mais que qualquer sessão dele em cache.
    private static readonly TimeSpan UserIndexLifetime = Lifetime + TimeSpan.FromMinutes(1);
    private static readonly RedisKey GenerationKey = "dontus:auth:generation";
    private long lastWarningTicks;

    public static ConfigurationOptions CreateOptions(string connectionString)
    {
        var options = ConfigurationOptions.Parse(connectionString);
        options.AbortOnConnectFail = false; // a API sobe mesmo com o Redis fora do ar
        options.BacklogPolicy = BacklogPolicy.FailFast; // sem conexão, falha na hora e vai ao banco
        if (!connectionString.Contains("asyncTimeout", StringComparison.OrdinalIgnoreCase)) options.AsyncTimeout = 1000;
        if (!connectionString.Contains("connectTimeout", StringComparison.OrdinalIgnoreCase)) options.ConnectTimeout = 2000;
        return options;
    }

    //busca a chave da sessão no cache, se não tiver, busca no banco e coloca no cache
    public async Task<CachedLocalSession?> GetAsync(string tokenHash)
    {
        try
        {
            var value = await redis.GetDatabase().StringGetAsync(SessionKey(tokenHash));
            return value.IsNullOrEmpty ? null : JsonSerializer.Deserialize<CachedLocalSession>(value.ToString());
        }
        catch (Exception error) when (IsCacheFailure(error))
        {
            Warn(error, "ler a sessão");
            return null;
        }
    }
    //contador
    //valida a geração da sessão
    public async Task<long?> GetGenerationAsync()
    {
        try
        {
            var value = await redis.GetDatabase().StringGetAsync(GenerationKey);
            return value.IsNull ? 0 : (long)value;
        }
        catch (Exception error) when (IsCacheFailure(error))
        {
            Warn(error, "ler a geração");
            return null;
        }
    }
    //grava a sessão de acordo com o tempo definido
    public async Task SetAsync(string tokenHash, CachedLocalSession session, long observedGeneration, DateTimeOffset now)
    {
        var remaining = session.ExpiresAt - now;
        if (remaining <= TimeSpan.Zero) return;
        try
        {
            var transaction = redis.GetDatabase().CreateTransaction();
            // Só grava se nenhuma invalidação (logout, bloqueio...) rodou enquanto o banco era consultado.
            transaction.AddCondition(observedGeneration == 0
                ? Condition.KeyNotExists(GenerationKey)
                : Condition.StringEqual(GenerationKey, observedGeneration));
            _ = transaction.StringSetAsync(SessionKey(tokenHash), JsonSerializer.Serialize(session), remaining < Lifetime ? remaining : Lifetime);
            _ = transaction.SetAddAsync(UserKey(session.UserId), tokenHash);
            _ = transaction.KeyExpireAsync(UserKey(session.UserId), UserIndexLifetime);
            await transaction.ExecuteAsync();
        }
        catch (Exception error) when (IsCacheFailure(error))
        {
            Warn(error, "gravar a sessão");
        }
    }

    //logout
    public async Task RemoveTokenAsync(string tokenHash)
    {
        try
        {
            var transaction = redis.GetDatabase().CreateTransaction();
            _ = transaction.StringIncrementAsync(GenerationKey);
            _ = transaction.KeyDeleteAsync(SessionKey(tokenHash));
            await transaction.ExecuteAsync();
        }
        catch (Exception error) when (IsCacheFailure(error))
        {
            logger.LogError(error, "Não foi possível remover a sessão do Redis; ela pode continuar válida por até {Seconds} s.", Lifetime.TotalSeconds);
        }
    }

    //remove todas as sessões do usuário
    public async Task RemoveUserAsync(Guid userId)
    {
        try
        {
            var database = redis.GetDatabase();
            // Primeiro a geração: um Set em andamento com a geração antiga deixa de gravar.
            await database.StringIncrementAsync(GenerationKey);
            var tokens = await database.SetMembersAsync(UserKey(userId));
            var keys = tokens.Select(token => SessionKey(token.ToString())).Append(UserKey(userId)).ToArray();
            await database.KeyDeleteAsync(keys);
        }
        catch (Exception error) when (IsCacheFailure(error))
        {
            logger.LogError(error, "Não foi possível remover as sessões do usuário {UserId} do Redis; elas podem continuar válidas por até {Seconds} s.",
                userId, Lifetime.TotalSeconds);
        }
    }
    //montam os nomes das chaves
    private static RedisKey SessionKey(string tokenHash) => $"dontus:auth:session:{tokenHash}";
    private static RedisKey UserKey(Guid userId) => $"dontus:auth:user:{userId:N}";

    private static bool IsCacheFailure(Exception error) => error is RedisException or TimeoutException or JsonException;

    // Com o Redis fora do ar toda requisição falharia; registra no máximo um aviso por minuto.
    private void Warn(Exception error, string action)
    {
        var now = DateTime.UtcNow.Ticks;
        var last = Interlocked.Read(ref lastWarningTicks);
        if (now - last < TimeSpan.TicksPerMinute || Interlocked.CompareExchange(ref lastWarningTicks, now, last) != last) return;
        logger.LogWarning(error, "Redis indisponível ao {Action}; a autenticação está consultando o banco.", action);
    }
}
