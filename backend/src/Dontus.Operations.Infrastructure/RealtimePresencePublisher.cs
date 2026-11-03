using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Dontus.Operations.Infrastructure;

public sealed class RealtimePresencePublisher(OperationsDbContext db, RealtimeBroker broker, ILogger<RealtimePresencePublisher> logger)
{
    public async Task UpdateAsync(Guid connectionId, Guid userId, bool online, CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(new { topic = "presence", connectionId, userId, online, at = DateTimeOffset.UtcNow });
        broker.Publish(payload);
        // NOTIFY shares presence with all API instances; heartbeats do not rebuild operation snapshots.
        if (db.Database.ProviderName?.Contains("Npgsql") == true)
            try { await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_notify('dontus_realtime', {payload})", ct); }
            catch (Exception error) when (error is DbException or TimeoutException or OperationCanceledException)
            { logger.LogDebug(error, "Não foi possível compartilhar a presença desta conexão."); }
    }
}
