using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using Dontus.Operations.Application;

namespace Dontus.Operations.Infrastructure;

[Flags]
public enum RealtimeChange { None = 0, Operations = 1, InternalChat = 2, Presence = 4, Typing = 8 }

// Notifications carry invalidation flags only. Data continues through authorized HTTP projections.
public sealed class RealtimeBroker(TimeProvider? clock = null)
{
    private sealed record ConnectionPresence(Guid UserId, DateTimeOffset At, bool Connected);
    private readonly ConcurrentDictionary<Guid, ConnectionPresence> presence = new();
    private readonly ConcurrentDictionary<Guid, DateTimeOffset> lastSeen = new();
    private readonly ConcurrentDictionary<Guid, DateTimeOffset> lastPresenceBroadcast = new();
    private DateTimeOffset Now => (clock ?? TimeProvider.System).GetUtcNow();
    public UserPresenceDto GetPresence(Guid userId) => new(userId,
        presence.Values.Any(session => session.UserId == userId && session.Connected && Now - session.At < TimeSpan.FromSeconds(75)),
        lastSeen.TryGetValue(userId, out var at) ? at : null);
    public UserPresenceDto[] GetPresence() => lastSeen.Keys.Select(GetPresence).ToArray();
    private readonly ConcurrentDictionary<Guid, Subscription> subscribers = new();
    private readonly string instance = Guid.NewGuid().ToString("N");
    private long revision;
    public bool Available { get; private set; }
    public string Cursor => $"{instance}:{Interlocked.Read(ref revision)}";
    public Subscription Subscribe(Guid userId, bool chat)
    {
        var subscription = new Subscription(userId, chat);
        // The dictionary key is independent of the user, so multiple tabs remain independent.
        subscribers[subscription.Id] = subscription;
        if (!Available) subscription.Disconnect();
        return subscription;
    }
    public void SetAvailable(bool available)
    {
        Available = available;
        Interlocked.Increment(ref revision);
        if (!available) foreach (var subscriber in subscribers.Values) subscriber.Disconnect();
    }
    private readonly ConcurrentDictionary<(Guid Room,Guid User,Guid Session),(bool Active,DateTimeOffset At)> typingPulses = new();
    public bool AllowTyping(Guid room, Guid user, Guid session, bool active)
    {
        var key=(room,user,session);var now=Now;
        if(typingPulses.TryGetValue(key,out var old)&&old.Active==active&&(!active||now-old.At<TimeSpan.FromSeconds(2)))return false;
        typingPulses[key]=(active,now);
        foreach(var stale in typingPulses.Where(entry=>now-entry.Value.At>TimeSpan.FromMinutes(1)))typingPulses.TryRemove(stale.Key,out _);
        return true;
    }
    public void Publish(string payload)
    {
        using var json = JsonDocument.Parse(payload);
        var topic = json.RootElement.GetProperty("topic").GetString();
        Guid? userId = json.RootElement.TryGetProperty("userId", out var id) && Guid.TryParse(id.GetString(), out var user) ? user : null;
        if (topic == "typing")
        {
            var root=json.RootElement;
            if(!userId.HasValue||!root.TryGetProperty("roomId",out var room)||!room.TryGetGuid(out var roomId)
                ||!root.TryGetProperty("sessionId",out var session)||!session.TryGetGuid(out var sessionId)
                ||!root.TryGetProperty("isTyping",out var typing)||typing.ValueKind is not (JsonValueKind.True or JsonValueKind.False)
                ||!root.TryGetProperty("at",out var stamp)||!stamp.TryGetDateTimeOffset(out var at)
                ||!root.TryGetProperty("recipients",out var recipients)||recipients.ValueKind!=JsonValueKind.Array)return;
            var targets=recipients.EnumerateArray().Where(value=>value.ValueKind==JsonValueKind.String&&value.TryGetGuid(out _)).Select(value=>value.GetGuid()).ToHashSet();
            var change=new ChatTypingDto(roomId,userId.Value,sessionId,typing.GetBoolean(),at);
            foreach(var subscriber in subscribers.Values.Where(subscriber=>subscriber.Chat&&targets.Contains(subscriber.UserId)))subscriber.NotifyTyping(change);
            return;
        }
        if (topic == "presence")
        {
            if (!userId.HasValue || !json.RootElement.TryGetProperty("connectionId", out var connection) || !Guid.TryParse(connection.GetString(), out var connectionId)
                || !json.RootElement.TryGetProperty("at", out var stamp) || !stamp.TryGetDateTimeOffset(out var at)
                || !json.RootElement.TryGetProperty("online", out var online) || online.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return;
            var before = GetPresence(userId.Value).IsOnline;
            var next = new ConnectionPresence(userId.Value, at, online.GetBoolean());
            presence.AddOrUpdate(connectionId, next, (_, previous) => at >= previous.At ? next : previous);
            lastSeen.AddOrUpdate(userId.Value, at, (_, previous) => at > previous ? at : previous);
            foreach (var stale in presence.Where(entry => Now - entry.Value.At > TimeSpan.FromMinutes(10))) presence.TryRemove(stale.Key, out _);
            var due = !lastPresenceBroadcast.TryGetValue(userId.Value, out var broadcastAt) || at - broadcastAt >= TimeSpan.FromSeconds(30);
            if (before != GetPresence(userId.Value).IsOnline || next.Connected && due)
            {
                lastPresenceBroadcast[userId.Value] = at;
                foreach (var subscriber in subscribers.Values.Where(subscriber => subscriber.Chat)) subscriber.Notify(RealtimeChange.Presence);
            }
            return;
        }
        if (topic != "operations" && (topic != "chat" || userId is null)) return;
        Interlocked.Increment(ref revision);
        foreach (var subscriber in subscribers.Values)
            if (topic == "operations") subscriber.Notify(RealtimeChange.Operations);
            else if (subscriber.Chat && subscriber.UserId == userId) subscriber.Notify(RealtimeChange.InternalChat);
    }
    public void Remove(Subscription subscription) { subscribers.TryRemove(subscription.Id, out _); subscription.Dispose(); }

    public sealed class Subscription(Guid userId, bool chat) : IDisposable
    {
        private int pending;
        private int disposed;
        public Guid Id { get; } = Guid.NewGuid();
        public Guid UserId { get; } = userId;
        public bool Chat { get; } = chat;
        public CancellationTokenSource Disconnected { get; } = new();
        public Channel<bool> Signal { get; } = Channel.CreateBounded<bool>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });
        private readonly ConcurrentDictionary<(Guid Room,Guid User,Guid Session),ChatTypingDto> typing = new();
        public void NotifyTyping(ChatTypingDto change)
        {
            typing.AddOrUpdate((change.RoomId,change.UserId,change.SessionId),change,(_,old)=>change.At>old.At||change.At==old.At&&!change.IsTyping?change:old);
            Notify(RealtimeChange.Typing);
        }
        public ChatTypingDto[] TakeTyping()
        {
            var result=new List<ChatTypingDto>();
            foreach(var key in typing.Keys)if(typing.TryRemove(key,out var value))result.Add(value);
            return result.ToArray();
        }
        public void Notify(RealtimeChange change) { if (Volatile.Read(ref disposed) != 0) return; Interlocked.Or(ref pending, (int)change); Signal.Writer.TryWrite(true); }
        public RealtimeChange Take() { while (Signal.Reader.TryRead(out _)) { } return (RealtimeChange)Interlocked.Exchange(ref pending, 0); }
        public void Disconnect() { try { Disconnected.Cancel(); } catch (ObjectDisposedException) { } }
        public void Dispose() { if (Interlocked.Exchange(ref disposed, 1) != 0) return; Disconnect(); Signal.Writer.TryComplete(); Disconnected.Dispose(); }
    }
}

// PostgreSQL delivers NOTIFY only after commit, including changes made by another API instance.
public sealed class RealtimeListener(IConfiguration configuration, RealtimeBroker broker, ILogger<RealtimeListener> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var options = new NpgsqlConnectionStringBuilder(configuration.GetConnectionString("Operations")) { KeepAlive = 20, Pooling = false };
                await using var connection = new NpgsqlConnection(options.ConnectionString);
                await connection.OpenAsync(stoppingToken);
                connection.Notification += (_, notification) => {
                    try { broker.Publish(notification.Payload); }
                    catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException) { logger.LogWarning("Notificação de sincronização inválida ignorada."); }
                };
                await using var command = new NpgsqlCommand("LISTEN dontus_realtime", connection);
                await command.ExecuteNonQueryAsync(stoppingToken);
                broker.SetAvailable(true);
                while (!stoppingToken.IsCancellationRequested) await connection.WaitAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogWarning(error, "Conexão de sincronização interrompida; reconectando."); }
            finally { broker.SetAvailable(false); }
            try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
