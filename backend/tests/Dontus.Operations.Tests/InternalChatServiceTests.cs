using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class InternalChatServiceTests
{
    [Theory]
    [InlineData(32)]
    [InlineData(50)]
    public async Task Large_videos_up_to_the_file_limit_are_stored_and_available_only_to_members(int megabytes)
    {
        await using var db = CreateContext();
        var sender = AddUser(db, "sender@test.local", "Remetente");
        var recipient = AddUser(db, "recipient@test.local", "Destinatário");
        var outsider = AddUser(db, "outsider@test.local", "Outro colaborador");
        await db.SaveChangesAsync();
        var service = CreateService(db);
        var room = await service.CreateRoomAsync(new(null, null, false, [recipient.Id]), Actor(sender));
        var bytes = new byte[megabytes * 1024 * 1024];
        bytes[0] = 42; bytes[^1] = 17;
        await using var content = new MemoryStream(bytes);
        var id = await service.UploadAttachmentAsync(new(room, "video.mp4", "video/mp4", content.Length, content), Actor(sender));
        var attachment = await service.GetAttachmentAsync(id, Actor(recipient));
        try
        {
            Assert.Equal("video/mp4", attachment.ContentType);
            Assert.Equal(content.Length, new FileInfo(attachment.FullPath).Length);
            await using var stored = File.OpenRead(attachment.FullPath);
            Assert.Equal(System.Security.Cryptography.SHA256.HashData(bytes),
                await System.Security.Cryptography.SHA256.HashDataAsync(stored));
            var message = Assert.Single(Assert.Single((await service.GetModuleAsync(Actor(recipient))).Rooms).Messages);
            Assert.Equal("video", message.Type);
            Assert.True(message.HasAttachment);
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.GetAttachmentAsync(id, Actor(outsider)))).StatusCode);
        }
        finally { File.Delete(attachment.FullPath); }
    }

    [Fact]
    public async Task Videos_over_50_MB_are_rejected_before_storing_a_message()
    {
        await using var db = CreateContext();
        var sender = AddUser(db, "sender@test.local", "Remetente");
        var recipient = AddUser(db, "recipient@test.local", "Destinatário");
        await db.SaveChangesAsync();
        var service = CreateService(db);
        var room = await service.CreateRoomAsync(new(null, null, false, [recipient.Id]), Actor(sender));
        await using var content = new MemoryStream([1]);
        var error = await Assert.ThrowsAsync<DomainException>(() => service.UploadAttachmentAsync(
            new(room, "video.mp4", "video/mp4", 50L * 1024 * 1024 + 1, content), Actor(sender)));
        Assert.Contains("50 MB", error.Message);
        Assert.Empty(db.InternalChatMessages);
    }

    [Fact]
    public async Task Text_emoji_and_document_messages_are_sent_and_remain_unread_until_seen()
    {
        await using var db = CreateContext();
        var sender = AddUser(db, "sender@dontus.local", "Remetente");
        var recipient = AddUser(db, "recipient@dontus.local", "Destinatário");
        await db.SaveChangesAsync();
        var service = CreateService(db);
        var roomId = await service.CreateRoomAsync(new CreateInternalChatRoomCommand(null, null, false, [recipient.Id]), Actor(sender));
        await service.SendMessageAsync(new SendInternalChatMessageCommand(roomId, "Olá!", "text"), Actor(sender));
        await service.SendMessageAsync(new SendInternalChatMessageCommand(roomId, "😀", "sticker"), Actor(sender));
        await using var content = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("documento de teste"));
        var attachmentId = await service.UploadAttachmentAsync(new UploadInternalChatAttachmentCommand(
            roomId, "teste.txt", "text/plain", content.Length, content), Actor(sender));
        var room = (await service.GetModuleAsync(Actor(recipient))).Rooms.Single();
        Assert.Equal(3, room.UnreadCount);
        Assert.Contains(room.Messages, message => message.Type == "sticker" && message.Body == "😀");
        Assert.Contains(room.Messages, message => message.Id == attachmentId && message.HasAttachment);
        var attachment = await service.GetAttachmentAsync(attachmentId, Actor(recipient));
        Assert.NotNull(attachment);
        foreach (var member in db.InternalChatRoomMembers)
        {
            member.JoinedAt = DateTimeOffset.UtcNow.AddDays(-60);
            member.LastReadAt = null;
        }
        foreach (var message in db.InternalChatMessages) message.CreatedAt = DateTimeOffset.UtcNow.AddDays(-45);
        await db.SaveChangesAsync();
        var olderUnread = (await service.GetModuleAsync(Actor(recipient))).Rooms.Single();
        Assert.Empty(olderUnread.Messages);
        Assert.Equal(3, olderUnread.UnreadCount);
        await service.MarkReadAsync(new MarkInternalChatRoomReadCommand(roomId), Actor(recipient));
        Assert.Equal(0, (await service.GetModuleAsync(Actor(recipient))).Rooms.Single().UnreadCount);
    }

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
        creator.IsCoordinator = true;
        await db.SaveChangesAsync();
        var service = CreateService(db);
        var actor = Actor(creator);
        var firstPhoto = "data:image/png;base64,AA==";
        var roomId = await service.CreateRoomAsync(
            new CreateInternalChatRoomCommand("Equipe", firstPhoto, true, [participant.Id]), actor);

        Assert.StartsWith($"/api/internal-chat-photos/room/{roomId}?v=", (await service.GetModuleAsync(actor)).Rooms.Single().PhotoDataUrl);
        Assert.Equal(firstPhoto, (await db.InternalChatRooms.SingleAsync()).PhotoDataUrl);

        var secondPhoto = "data:image/webp;base64,AA==";
        await service.UpdateGroupAsync(new UpdateInternalChatGroupCommand(roomId, "Equipe atualizada", secondPhoto), actor);
        var updated = (await service.GetModuleAsync(actor)).Rooms.Single();
        Assert.Equal("Equipe atualizada", updated.Name);
        Assert.StartsWith($"/api/internal-chat-photos/room/{roomId}?v=", updated.PhotoDataUrl);
        Assert.Equal(secondPhoto, (await db.InternalChatRooms.SingleAsync()).PhotoDataUrl);
    }

    [Fact]
    public async Task Loads_thirty_days_and_can_load_older_history_without_disclosing_other_rooms()
    {
        await using var db = CreateContext();
        var user = AddUser(db, "criador@dontus.local", "Criador");
        var peer = AddUser(db, "colega@dontus.local", "Colega");
        await db.SaveChangesAsync();
        var service = CreateService(db);
        var actor = Actor(user);
        var roomId = await service.CreateRoomAsync(new CreateInternalChatRoomCommand(null, null, false, [peer.Id]), actor);
        foreach (var member in await db.InternalChatRoomMembers.ToListAsync()) member.JoinedAt = DateTimeOffset.UtcNow.AddDays(-90);
        var oldId = await service.SendMessageAsync(new SendInternalChatMessageCommand(roomId, "Mensagem antiga", "text"), actor);
        (await db.InternalChatMessages.SingleAsync(message => message.Id == oldId)).CreatedAt = DateTimeOffset.UtcNow.AddDays(-45);
        await db.SaveChangesAsync();
        await service.SendMessageAsync(new SendInternalChatMessageCommand(roomId, "Mensagem atual", "text"), actor);
        Assert.Single((await service.GetModuleAsync(actor)).Rooms.Single().Messages);
        Assert.Equal(2, (await service.GetModuleAsync(actor, historyDays: 60)).Rooms.Single().Messages.Count);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Only_coordinators_can_create_groups_while_private_chat_remains_available(bool coordinator)
    {
        await using var db = CreateContext();
        var creator = AddUser(db, "creator@dontus.local", "Criador");
        creator.IsCoordinator = coordinator;
        var peer = AddUser(db, "peer@dontus.local", "Colega");
        await db.SaveChangesAsync();
        var service = CreateService(db);
        var actor = Actor(creator);
        var command = new CreateInternalChatRoomCommand("Grupo", null, true, [peer.Id]);
        if (coordinator)
            Assert.NotEqual(Guid.Empty, await service.CreateRoomAsync(command, actor));
        else
        {
            var error = await Assert.ThrowsAsync<DomainException>(() => service.CreateRoomAsync(command, actor));
            Assert.Equal(403, error.StatusCode);
            Assert.Empty(db.InternalChatRooms);
        }
        Assert.NotEqual(Guid.Empty, await service.CreateRoomAsync(new CreateInternalChatRoomCommand(null, null, false, [peer.Id]), actor));
    }

    private static InternalChatService CreateService(OperationsDbContext db)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["InternalChat:FilesPath"] = Path.Combine(Path.GetTempPath(), $"dontus-internal-chat-tests-{Guid.NewGuid():N}"),
        }).Build();
        return new InternalChatService(db, configuration);
    }

    [Fact]
    public async Task Authors_can_edit_and_delete_their_own_messages_with_server_timestamps_and_version_checks()
    {
        await using var db = CreateContext(); var sender = AddUser(db,"author@test.local","Autor"); var recipient = AddUser(db,"reader@test.local","Leitor"); await db.SaveChangesAsync();
        var service = CreateService(db); var roomId = await service.CreateRoomAsync(new(null,null,false,[recipient.Id]),Actor(sender));
        var id = await service.SendMessageAsync(new(roomId,"Texto original","text"),Actor(sender)); var createdAt = (await db.InternalChatMessages.SingleAsync()).CreatedAt;
        await service.EditMessageAsync(new(roomId,id,"Texto corrigido",1),Actor(sender));
        var edited = Assert.Single((await service.GetModuleAsync(Actor(recipient))).Rooms).Messages.Single();
        Assert.Equal("Texto corrigido",edited.Body); Assert.NotNull(edited.EditedAt); Assert.Equal(createdAt,edited.CreatedAt); Assert.Equal(2,edited.Version);
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.DeleteMessageAsync(new(roomId,id,1),Actor(sender)))).StatusCode);
        await service.DeleteMessageAsync(new(roomId,id,2),Actor(sender));
        var room = Assert.Single((await service.GetModuleAsync(Actor(recipient))).Rooms); var deleted = Assert.Single(room.Messages);
        Assert.NotNull(deleted.DeletedAt); Assert.Equal("",deleted.Body); Assert.False(deleted.HasAttachment); Assert.False(deleted.IsPinned); Assert.Equal(0,room.UnreadCount);
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.EditMessageAsync(new(roomId,id,"Ressuscitar",3),Actor(sender)))).StatusCode);
        Assert.Equal(new[]{"EditMessage","DeleteMessage"},await db.AuditEvents.Where(entry=>entry.Module=="internalChat" && entry.Resource=="internal_chat_message").OrderBy(entry=>entry.CreatedAt).Select(entry=>entry.Action).ToArrayAsync());
    }

    [Fact]
    public async Task Even_administrators_cannot_change_other_peoples_messages_or_access_removed_attachments()
    {
        await using var db = CreateContext(); var sender = AddUser(db,"author@test.local","Autor"); var reader = AddUser(db,"reader@test.local","Leitor"); await db.SaveChangesAsync();
        var service = CreateService(db); var roomId = await service.CreateRoomAsync(new(null,null,false,[reader.Id]),Actor(sender)); var id = await service.SendMessageAsync(new(roomId,"Privado","text"),Actor(sender));
        var admin = Actor(reader) with {FullAccess=true};
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.EditMessageAsync(new(roomId,id,"Alterado",1),admin))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.DeleteMessageAsync(new(roomId,id,1),admin))).StatusCode);
        await using var content = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("anexo"));
        var attachmentId = await service.UploadAttachmentAsync(new(roomId,"arquivo.txt","text/plain",content.Length,content),Actor(sender));
        await service.DeleteMessageAsync(new(roomId,attachmentId,1),Actor(sender));
        Assert.Equal(404,(await Assert.ThrowsAsync<DomainException>(()=>service.GetAttachmentAsync(attachmentId,Actor(reader)))).StatusCode);
        var attachment = (await service.GetModuleAsync(Actor(reader))).Rooms.Single().Messages.Single(entry=>entry.Id==attachmentId);
        Assert.Equal("",attachment.FileName); Assert.Equal("",attachment.ContentType); Assert.False(attachment.HasAttachment);
    }

    [Fact]
    public async Task Editing_loaded_old_messages_returns_the_correction_in_the_current_snapshot()
    {
        await using var db = CreateContext(); var sender = AddUser(db,"author@test.local","Autor"); var reader = AddUser(db,"reader@test.local","Leitor"); await db.SaveChangesAsync();
        var service = CreateService(db); var roomId = await service.CreateRoomAsync(new(null,null,false,[reader.Id]),Actor(sender)); var id = await service.SendMessageAsync(new(roomId,"Antiga","text"),Actor(sender));
        foreach(var member in db.InternalChatRoomMembers)member.JoinedAt=DateTimeOffset.UtcNow.AddDays(-60);
        (await db.InternalChatMessages.SingleAsync()).CreatedAt=DateTimeOffset.UtcNow.AddDays(-45); await db.SaveChangesAsync();
        Assert.Empty((await service.GetModuleAsync(Actor(reader))).Rooms.Single().Messages);
        await service.EditMessageAsync(new(roomId,id,"Corrigida no histórico",1),Actor(sender));
        Assert.Equal("Corrigida no histórico",(await service.GetModuleAsync(Actor(reader))).Rooms.Single().Messages.Single().Body);
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
