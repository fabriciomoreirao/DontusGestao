using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Dontus.Operations.Infrastructure;

[Flags]
public enum RealtimeChange { None = 0, Operations = 1, InternalChat = 2 }

// Notifications carry invalidation flags only. Data continues through authorized HTTP projections.
public sealed class RealtimeBroker
{
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
    public void Publish(string payload)
    {
        using var json = JsonDocument.Parse(payload);
        var topic = json.RootElement.GetProperty("topic").GetString();
        Guid? userId = json.RootElement.TryGetProperty("userId", out var id) && Guid.TryParse(id.GetString(), out var user) ? user : null;
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
