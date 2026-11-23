using Dontus.Operations.Application;

namespace Dontus.Operations.Infrastructure.Redis;

public sealed record CachedLocalSession(
    Guid SessionId,
    Guid UserId,
    string Email,
    string DisplayName,
    string AccessScheduleJson,
    DateTimeOffset ExpiresAt,
    ActorContext Actor);

/// <summary>
/// Cache das sessões locais já validadas no banco. Usado só pela autenticação (ResolveSessionAsync).
/// Logout, bloqueio, exclusão e troca de dados do usuário removem as entradas dele na hora.
/// </summary>
public interface ILocalSessionCache
{
    Task<CachedLocalSession?> GetAsync(string tokenHash);

    /// <summary>Muda a cada invalidação. Lida antes da consulta ao banco; null = não guardar (cache indisponível).</summary>
    Task<long?> GetGenerationAsync();

    /// <summary>Guarda só se nenhuma invalidação aconteceu desde <paramref name="observedGeneration"/>.</summary>
    Task SetAsync(string tokenHash, CachedLocalSession session, long observedGeneration, DateTimeOffset now);

    Task RemoveTokenAsync(string tokenHash);

    Task RemoveUserAsync(Guid userId);
}
