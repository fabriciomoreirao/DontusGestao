using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class InternalChatTypingTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static AppUser User(string name) => new() { Email=$"{name}@test",DisplayName=name,CreatedBy="tests" };
    private static ActorContext Actor(AppUser user,bool create=true) => new(user.Email,user.DisplayName,"Colaborador","",[new("internalChat",true,create,true,false,false)]);

    [Fact]
    public async Task Typing_only_reaches_active_room_members_with_chat_access_without_invalidating_snapshots_or_saving_text()
    {
        await using var db=Context();var sender=User("sender");var reader=User("reader");var outsider=User("outsider");var inactive=User("inactive");inactive.Active=false;
        var room=new InternalChatRoom{CreatedByUserId=sender.Id};db.Users.AddRange(sender,reader,outsider,inactive);db.InternalChatRooms.Add(room);
        db.InternalChatRoomMembers.AddRange(new(){RoomId=room.Id,UserId=sender.Id},new(){RoomId=room.Id,UserId=reader.Id},new(){RoomId=room.Id,UserId=inactive.Id});await db.SaveChangesAsync();
        var broker=new RealtimeBroker();broker.SetAvailable(true);using var allowed=broker.Subscribe(reader.Id,true);using var forbidden=broker.Subscribe(outsider.Id,true);using var noChat=broker.Subscribe(reader.Id,false);using var self=broker.Subscribe(sender.Id,true);using var disabled=broker.Subscribe(inactive.Id,true);
        var cursor=broker.Cursor;var service=new InternalChatTypingService(db,broker);var session=Guid.NewGuid();
        await service.PublishAsync(room.Id,session,true,Actor(sender));
        Assert.Equal(RealtimeChange.Typing,allowed.Take());var started=Assert.Single(allowed.TakeTyping());Assert.Equal(sender.Id,started.UserId);Assert.Equal(room.Id,started.RoomId);Assert.True(started.IsTyping);
        Assert.Equal(RealtimeChange.None,forbidden.Take());Assert.Equal(RealtimeChange.None,noChat.Take());Assert.Equal(RealtimeChange.None,self.Take());Assert.Equal(RealtimeChange.None,disabled.Take());
        await service.PublishAsync(room.Id,session,true,Actor(sender));Assert.Equal(RealtimeChange.None,allowed.Take());
        await service.PublishAsync(room.Id,session,false,Actor(sender));Assert.Equal(RealtimeChange.Typing,allowed.Take());Assert.False(Assert.Single(allowed.TakeTyping()).IsTyping);
        Assert.Equal(cursor,broker.Cursor);Assert.Empty(db.InternalChatMessages);Assert.Empty(db.Activities);
    }
    [Fact]
    public async Task Non_members_removed_members_and_read_only_users_cannot_advertise_typing()
    {
        await using var db=Context();var sender=User("sender");var reader=User("reader");var room=new InternalChatRoom{CreatedByUserId=reader.Id};db.Users.AddRange(sender,reader);db.InternalChatRooms.Add(room);await db.SaveChangesAsync();
        var broker=new RealtimeBroker();broker.SetAvailable(true);var service=new InternalChatTypingService(db,broker);var session=Guid.NewGuid();
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.PublishAsync(room.Id,session,true,Actor(sender)))).StatusCode);
        var membership=new InternalChatRoomMember{RoomId=room.Id,UserId=sender.Id};db.Add(membership);await db.SaveChangesAsync();
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.PublishAsync(room.Id,session,true,Actor(sender,false)))).StatusCode);
        db.Remove(membership);await db.SaveChangesAsync();Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.PublishAsync(room.Id,session,false,Actor(sender)))).StatusCode);
    }
    [Fact]
    public void Broker_coalesces_typing_by_session_and_keeps_newer_stops_over_delayed_pulses()
    {
        var broker=new RealtimeBroker();broker.SetAvailable(true);var user=Guid.NewGuid();using var recipient=broker.Subscribe(user,true);var room=Guid.NewGuid();var sender=Guid.NewGuid();var session=Guid.NewGuid();var at=DateTimeOffset.UtcNow;
        string Message(bool active,DateTimeOffset stamp)=>System.Text.Json.JsonSerializer.Serialize(new{topic="typing",roomId=room,userId=sender,sessionId=session,isTyping=active,at=stamp,recipients=new[]{user}});
        broker.Publish(Message(true,at));broker.Publish(Message(false,at));broker.Publish(Message(true,at));
        Assert.Equal(RealtimeChange.Typing,recipient.Take());Assert.False(Assert.Single(recipient.TakeTyping()).IsTyping);Assert.Empty(recipient.TakeTyping());
    }
}
