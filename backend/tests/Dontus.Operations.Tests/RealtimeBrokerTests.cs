using Dontus.Operations.Infrastructure;

namespace Dontus.Operations.Tests;

public sealed class RealtimeBrokerTests
{
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
