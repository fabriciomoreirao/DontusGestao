using System.Net.WebSockets;
using System.Security.Claims;
using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class RealtimeEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public static void MapRealtime(this WebApplication app)
    {
        app.MapGet("/api/realtime", async (HttpContext context, IAccessControlService access, OperationsDbContext db,
            RealtimeBroker broker, RealtimePresencePublisher presence, IServiceScopeFactory scopes, IConfiguration configuration) =>
        {
            if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 426; return; }
            if (!broker.Available) { context.Response.StatusCode = 503; return; }
            var identity = context.User.ToIdentity();
            var actor = await access.ResolveActorAsync(identity, context.RequestAborted);
            var userId = await db.Users.Where(user => user.Email == actor.Email).Select(user => user.Id).SingleAsync(context.RequestAborted);
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            var subscription = broker.Subscribe(userId, actor.HasPermission("internalChat", "view"));
            using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, subscription.Disconnected.Token);
            try
            {
                await presence.UpdateAsync(subscription.Id, userId, true, lifetime.Token);
                var presenceAt = DateTimeOffset.UtcNow;
                await Send(new { type = "ready", cursor = broker.Cursor, presence = subscription.Chat ? broker.GetPresence() : null }, lifetime.Token);
                var receive = Receive();
                try
                {
                    var checkedAt = DateTimeOffset.UtcNow;
                    while (!lifetime.IsCancellationRequested)
                    {
                        using var heartbeat = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
                        heartbeat.CancelAfter(TimeSpan.FromSeconds(25));
                        try { await subscription.Signal.Reader.WaitToReadAsync(heartbeat.Token); }
                        catch (OperationCanceledException) when (!lifetime.IsCancellationRequested) { }
                        lifetime.Token.ThrowIfCancellationRequested();
                        if (DateTimeOffset.UtcNow - presenceAt >= TimeSpan.FromSeconds(25))
                        {
                            await presence.UpdateAsync(subscription.Id, userId, true, lifetime.Token);
                            presenceAt = DateTimeOffset.UtcNow;
                        }
                        if (DateTimeOffset.UtcNow - checkedAt >= TimeSpan.FromMinutes(1))
                        {
                            checkedAt = DateTimeOffset.UtcNow;
                            await using var scope = scopes.CreateAsyncScope();
                            var authentication = scope.ServiceProvider.GetRequiredService<ILocalAuthenticationService>();
                            var valid = !configuration.GetValue("Authentication:LocalPasswordEnabled", false)
                                || await authentication.ResolveSessionAsync(context.Request.Headers["X-Local-Session"].ToString(), lifetime.Token) is not null;
                            if (!valid) { await Send(new { type = "unauthorized" }, lifetime.Token); break; }
                            await scope.ServiceProvider.GetRequiredService<IAccessControlService>().ResolveActorAsync(identity, lifetime.Token);
                        }
                        var changes = subscription.Take();
                        await Send(new { type = changes == RealtimeChange.None ? "heartbeat" : "changed",
                            operations = changes.HasFlag(RealtimeChange.Operations), internalChat = changes.HasFlag(RealtimeChange.InternalChat),
                            presence = subscription.Chat && (changes.HasFlag(RealtimeChange.Presence) || changes == RealtimeChange.None) ? broker.GetPresence() : null }, lifetime.Token);
                    }
                }
                finally { await lifetime.CancelAsync(); try { await receive; } catch (OperationCanceledException) { } }
            }
            catch (Exception error) when (error is OperationCanceledException or WebSocketException or DomainException) { }
            finally
            {
                broker.Remove(subscription);
                using var presenceTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await presence.UpdateAsync(subscription.Id, userId, false, presenceTimeout.Token);
                if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                    try { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2)); await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Reconecte para sincronizar.", timeout.Token); }
                    catch (Exception error) when (error is OperationCanceledException or WebSocketException) { }
            }

            async Task Send(object message, CancellationToken ct) => await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(message, JsonOptions).AsMemory(), WebSocketMessageType.Text, true, ct);
            async Task Receive()
            {
                try
                {
                    // The connection is server-to-client; mutation commands keep their HTTP authorization.
                    await socket.ReceiveAsync(new byte[256].AsMemory(), lifetime.Token);
                }
                finally { await lifetime.CancelAsync(); }
            }
        }).RequireAuthorization().RequireRateLimiting("operations");
    }
}
