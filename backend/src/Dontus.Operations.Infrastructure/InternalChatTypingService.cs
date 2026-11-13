using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed record ChatTypingDto(Guid RoomId, Guid UserId, Guid SessionId, bool IsTyping, DateTimeOffset At);

// Ephemeral presence only: no messages, history, work-item writes or snapshot invalidations.
public sealed class InternalChatTypingService(OperationsDbContext db, RealtimeBroker broker)
{
    public async Task PublishAsync(Guid roomId, Guid sessionId, bool typing, ActorContext actor, CancellationToken ct = default)
    {
        actor.RequirePermission("internalChat", "view");
        if (typing) actor.RequirePermission("internalChat", "create");
        if (roomId == Guid.Empty || sessionId == Guid.Empty) throw new DomainException("Informe a conversa.");
        var userId = await db.Users.Where(user => user.Email == actor.Email && user.Active && user.BlockedAt == null).Select(user => (Guid?)user.Id).SingleOrDefaultAsync(ct)
            ?? throw new DomainException("Colaborador indisponível.", 403);
        var members = await db.InternalChatRoomMembers.AsNoTracking().Where(member => member.RoomId == roomId).Select(member => member.UserId).ToArrayAsync(ct);
        if (!members.Contains(userId)) throw new DomainException("Você não participa desta conversa.", 403);
        if (!broker.AllowTyping(roomId, userId, sessionId, typing)) return;
        var activeMembers = await db.Users.Where(user => members.Contains(user.Id) && user.Id != userId && user.Active && user.BlockedAt == null).Select(user => user.Id).ToArrayAsync(ct);
        var at = DateTimeOffset.UtcNow;
        foreach (var recipients in activeMembers.Chunk(100))
        {
            var payload = JsonSerializer.Serialize(new { topic = "typing", roomId, userId, sessionId, isTyping = typing, at, recipients });
            broker.Publish(payload);
            if (db.Database.ProviderName?.Contains("Npgsql") == true)
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_notify('dontus_realtime', {payload})", ct);
        }
    }
}
