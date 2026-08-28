using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class InternalChatServiceTests
{
    [Fact]
    public async Task Keeps_direct_conversations_private_to_their_members()
    {
        await using var db = CreateContext();
        var creator = AddUser(db, "criador@dontus.local", "Criador");
        var participant = AddUser(db, "participante@dontus.local", "Participante");
        var outsider = AddUser(db, "externo@dontus.local", "Externo");
        await db.SaveChangesAsync();
        var service = CreateService(db);
        var creatorActor = Actor(creator);
        var outsiderActor = Actor(outsider);

        var roomId = await service.CreateRoomAsync(
            new CreateInternalChatRoomCommand(null, null, false, [participant.Id]), creatorActor);
        await service.SendMessageAsync(
            new SendInternalChatMessageCommand(roomId, "Mensagem privada", "text"), creatorActor);

        var creatorModule = await service.GetModuleAsync(creatorActor);
        var outsiderModule = await service.GetModuleAsync(outsiderActor);
        var denied = await Assert.ThrowsAsync<DomainException>(() => service.SendMessageAsync(
            new SendInternalChatMessageCommand(roomId, "Tentativa indevida", "text"), outsiderActor));

        Assert.Single(creatorModule.Rooms);
        Assert.Single(creatorModule.Rooms.Single().Messages);
        Assert.Empty(outsiderModule.Rooms);
        Assert.Equal(403, denied.StatusCode);
    }

    [Fact]
    public async Task Reuses_an_existing_direct_conversation_between_the_same_people()
    {
        await using var db = CreateContext();
        var creator = AddUser(db, "criador@dontus.local", "Criador");
        var participant = AddUser(db, "participante@dontus.local", "Participante");
        await db.SaveChangesAsync();
        var service = CreateService(db);

        var first = await service.CreateRoomAsync(
            new CreateInternalChatRoomCommand(null, null, false, [participant.Id]), Actor(creator));
        var second = await service.CreateRoomAsync(
            new CreateInternalChatRoomCommand(null, null, false, [participant.Id]), Actor(creator));

        Assert.Equal(first, second);
        Assert.Single(await db.InternalChatRooms.ToListAsync());
    }

    [Fact]
    public async Task Tracks_unread_messages_and_reopens_an_archived_conversation()
    {
        await using var db = CreateContext();
        var creator = AddUser(db, "criador@dontus.local", "Criador");
        var participant = AddUser(db, "participante@dontus.local", "Participante");
        await db.SaveChangesAsync();
        var service = CreateService(db);
        var creatorActor = Actor(creator);
        var participantActor = Actor(participant);
        var roomId = await service.CreateRoomAsync(
            new CreateInternalChatRoomCommand(null, null, false, [participant.Id]), creatorActor);

        await service.SendMessageAsync(new SendInternalChatMessageCommand(roomId, "Primeira", "text"), creatorActor);
        Assert.Equal(1, (await service.GetModuleAsync(participantActor)).Rooms.Single().UnreadCount);

        await service.SetArchivedAsync(new SetInternalChatRoomArchivedCommand(roomId, true), participantActor);
        Assert.True((await service.GetModuleAsync(participantActor)).Rooms.Single().IsArchived);

        await service.SendMessageAsync(new SendInternalChatMessageCommand(roomId, "Segunda", "text"), creatorActor);
        var reopened = (await service.GetModuleAsync(participantActor)).Rooms.Single();
        Assert.False(reopened.IsArchived);
        Assert.Equal(1, reopened.UnreadCount);

        await service.MarkReadAsync(new MarkInternalChatRoomReadCommand(roomId), participantActor);
        Assert.Equal(0, (await service.GetModuleAsync(participantActor)).Rooms.Single().UnreadCount);
    }

    [Fact]
    public async Task Stores_and_updates_a_private_group_photo()
    {
        await using var db = CreateContext();
        var creator = AddUser(db, "criador@dontus.local", "Criador");
        var participant = AddUser(db, "participante@dontus.local", "Participante");
        await db.SaveChangesAsync();
        var service = CreateService(db);
        var actor = Actor(creator);
        var firstPhoto = "data:image/png;base64,AA==";
        var roomId = await service.CreateRoomAsync(
            new CreateInternalChatRoomCommand("Equipe", firstPhoto, true, [participant.Id]), actor);

        Assert.Equal(firstPhoto, (await service.GetModuleAsync(actor)).Rooms.Single().PhotoDataUrl);

        var secondPhoto = "data:image/webp;base64,AA==";
        await service.UpdateGroupAsync(new UpdateInternalChatGroupCommand(roomId, "Equipe atualizada", secondPhoto), actor);
        var updated = (await service.GetModuleAsync(actor)).Rooms.Single();
        Assert.Equal("Equipe atualizada", updated.Name);
        Assert.Equal(secondPhoto, updated.PhotoDataUrl);
    }

    private static InternalChatService CreateService(OperationsDbContext db)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["InternalChat:FilesPath"] = Path.Combine(Path.GetTempPath(), $"dontus-internal-chat-tests-{Guid.NewGuid():N}"),
        }).Build();
        return new InternalChatService(db, configuration);
    }

    private static AppUser AddUser(OperationsDbContext db, string email, string name)
    {
        var user = new AppUser
        {
            Email = email,
            DisplayName = name,
            Department = "Testes",
            CreatedBy = "tests@dontus.local",
        };
        db.Users.Add(user);
        return user;
    }

    private static ActorContext Actor(AppUser user) => new(
        user.Email,
        user.DisplayName,
        "Colaborador",
        user.Department,
        [new EffectivePermission("internalChat", true, true, true, false, false)]);

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-internal-chat-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }
}
