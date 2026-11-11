using Dontus.Operations.Infrastructure;

namespace Dontus.Operations.Tests;

public sealed class RealtimeBrokerTests
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.Parse("2026-11-03T12:00:00Z");
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private static string Presence(Guid connection, Guid user, bool online, DateTimeOffset at) =>
        System.Text.Json.JsonSerializer.Serialize(new { topic = "presence", connectionId = connection, userId = user, online, at });

    [Fact]
    public void Presence_tracks_multiple_tabs_without_reloading_operations_or_exposing_status_to_non_chat_subscribers()
    {
        var clock = new Clock(); var broker = new RealtimeBroker(clock); broker.SetAvailable(true);
        using var viewer = broker.Subscribe(Guid.NewGuid(), true); using var noChat = broker.Subscribe(Guid.NewGuid(), false);
        var user = Guid.NewGuid(); var first = Guid.NewGuid(); var second = Guid.NewGuid(); var cursor = broker.Cursor;
        broker.Publish(Presence(first, user, true, clock.Now));
        Assert.True(broker.GetPresence(user).IsOnline); Assert.Equal(RealtimeChange.Presence, viewer.Take()); Assert.Equal(RealtimeChange.None, noChat.Take());
        broker.Publish(Presence(second, user, true, clock.Now)); Assert.Equal(RealtimeChange.None, viewer.Take());
        clock.Now = clock.Now.AddSeconds(1); broker.Publish(Presence(first, user, false, clock.Now));
        Assert.True(broker.GetPresence(user).IsOnline); Assert.Equal(RealtimeChange.None, viewer.Take());
        broker.Publish(Presence(second, user, false, clock.Now));
        Assert.False(broker.GetPresence(user).IsOnline); Assert.Equal(RealtimeChange.Presence, viewer.Take()); Assert.Equal(cursor, broker.Cursor);
    }

    [Fact]
    public void Heartbeats_refresh_the_last_seen_snapshot_while_a_person_stays_connected()
    {
        var clock=new Clock();var broker=new RealtimeBroker(clock);broker.SetAvailable(true);
        using var viewer=broker.Subscribe(Guid.NewGuid(),true);var user=Guid.NewGuid();var connection=Guid.NewGuid();
        broker.Publish(Presence(connection,user,true,clock.Now));viewer.Take();
        clock.Now=clock.Now.AddSeconds(15);broker.Publish(Presence(connection,user,true,clock.Now));Assert.Equal(RealtimeChange.None,viewer.Take());
        clock.Now=clock.Now.AddSeconds(15);broker.Publish(Presence(connection,user,true,clock.Now));
        Assert.Equal(RealtimeChange.Presence,viewer.Take());Assert.True(broker.GetPresence(user).IsOnline);Assert.Equal(clock.Now,broker.GetPresence(user).LastSeenAt);
    }

    [Fact]
    public void Lost_connections_expire_and_delayed_heartbeats_do_not_resurrect_closed_tabs()
    {
        var clock = new Clock(); var broker = new RealtimeBroker(clock); var user = Guid.NewGuid(); var connection = Guid.NewGuid(); var opened = clock.Now;
        broker.Publish(Presence(connection, user, true, opened)); clock.Now = clock.Now.AddSeconds(76);
        Assert.False(broker.GetPresence(user).IsOnline);
        broker.Publish(Presence(connection, user, true, clock.Now)); Assert.True(broker.GetPresence(user).IsOnline);
        clock.Now = clock.Now.AddSeconds(1); broker.Publish(Presence(connection, user, false, clock.Now));
        broker.Publish(Presence(connection, user, true, opened));
        Assert.False(broker.GetPresence(user).IsOnline); Assert.Equal(clock.Now, broker.GetPresence(user).LastSeenAt);
    }
    [Fact]
    public void Private_chat_invalidations_only_reach_participants_with_chat_access()
    {
        var broker = new RealtimeBroker(); broker.SetAvailable(true); var user = Guid.NewGuid();
        using var own = broker.Subscribe(user, true); using var other = broker.Subscribe(Guid.NewGuid(), true);
        using var noChat = broker.Subscribe(user, false);
        broker.Publish($$"""{"topic":"chat","userId":"{{user}}"}""");
        Assert.Equal(RealtimeChange.InternalChat, own.Take()); Assert.Equal(RealtimeChange.None, other.Take()); Assert.Equal(RealtimeChange.None, noChat.Take());
    }
    [Fact]
    public void Bursts_are_bounded_without_losing_operational_or_chat_flags()
    {
        var broker = new RealtimeBroker(); broker.SetAvailable(true); var user = Guid.NewGuid(); using var sub = broker.Subscribe(user, true);
        broker.Publish("""{"topic":"operations"}""");
        for (var i = 0; i < 1000; i++) broker.Publish($$"""{"topic":"chat","userId":"{{user}}"}""");
        Assert.Equal(1, sub.Signal.Reader.Count);
        Assert.Equal(RealtimeChange.Operations | RealtimeChange.InternalChat, sub.Take());
        Assert.Equal(RealtimeChange.None, sub.Take());
    }
    [Fact]
    public void Listener_loss_disconnects_clients_and_changes_the_cursor()
    {
        var broker = new RealtimeBroker(); broker.SetAvailable(true); using var sub = broker.Subscribe(Guid.NewGuid(), true);
        var cursor = broker.Cursor;
        broker.SetAvailable(false);
        Assert.False(broker.Available); Assert.NotEqual(cursor, broker.Cursor); Assert.True(sub.Disconnected.IsCancellationRequested);
        broker.Remove(sub);
        broker.Publish("""{"topic":"operations"}""");
    }
    [Fact]
    public void A_subscription_racing_with_listener_loss_cannot_stay_falsely_connected()
    {
        var broker = new RealtimeBroker(); using var offline = broker.Subscribe(Guid.NewGuid(), true);
        Assert.True(offline.Disconnected.IsCancellationRequested);
        broker.SetAvailable(true); using var online = broker.Subscribe(Guid.NewGuid(), true);
        Assert.False(online.Disconnected.IsCancellationRequested);
    }
}
