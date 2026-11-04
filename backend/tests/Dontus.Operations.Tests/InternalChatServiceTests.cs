using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class InternalChatServiceTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Replies_keep_the_original_message_in_private_and_group_chats_even_outside_the_history_window(bool group)
    {
        await using var db=CreateContext();var sender=AddUser(db,"sender@test","Remetente");sender.IsCoordinator=true;
        var reader=AddUser(db,"reader@test","Leitor");await db.SaveChangesAsync();
        var service=CreateService(db);var room=await service.CreateRoomAsync(new(group?"Equipe":null,null,group,[reader.Id]),Actor(sender));
        var originalId=await service.SendMessageAsync(new(room,"Pergunta original","text"),Actor(sender));
        foreach(var member in db.InternalChatRoomMembers)member.JoinedAt=DateTimeOffset.UtcNow.AddDays(-60);
        var original=await db.InternalChatMessages.SingleAsync();original.CreatedAt=DateTimeOffset.UtcNow.AddDays(-45);original.UpdatedAt=original.CreatedAt;await db.SaveChangesAsync();
        var replyId=await service.SendMessageAsync(new(room,"Minha resposta","text",originalId),Actor(reader));
        var reply=Assert.Single((await service.GetModuleAsync(Actor(reader))).Rooms.Single().Messages);
        Assert.Equal(replyId,reply.Id);Assert.Equal(originalId,reply.ReplyTo!.Id);Assert.Equal("Remetente",reply.ReplyTo.SenderName);Assert.Equal("Pergunta original",reply.ReplyTo.Body);
        await service.DeleteMessageAsync(new(room,originalId,original.Version),Actor(sender));
        var quoted=(await service.GetModuleAsync(Actor(reader))).Rooms.Single().Messages.Single(message=>message.Id==replyId).ReplyTo!;
        Assert.NotNull(quoted.DeletedAt);Assert.Empty(quoted.Body);Assert.Empty(quoted.FileName);
    }

    [Fact]
    public async Task Replies_reject_other_rooms_deleted_messages_and_messages_from_before_joining()
    {
        await using var db=CreateContext();var sender=AddUser(db,"sender@test","Remetente");sender.IsCoordinator=true;
        var reader=AddUser(db,"reader@test","Leitor");var outsider=AddUser(db,"other@test","Outro");await db.SaveChangesAsync();
        var service=CreateService(db);var room=await service.CreateRoomAsync(new("Equipe",null,true,[reader.Id]),Actor(sender));
        var other=await service.CreateRoomAsync(new(null,null,false,[outsider.Id]),Actor(sender));
        var originalId=await service.SendMessageAsync(new(room,"Reservado","text"),Actor(sender));
        Assert.Equal(404,(await Assert.ThrowsAsync<DomainException>(()=>service.SendMessageAsync(new(other,"Incorreta","text",originalId),Actor(sender)))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.SendMessageAsync(new(room,"Incorreta","text",originalId),Actor(outsider)))).StatusCode);
        db.InternalChatRoomMembers.Add(new(){RoomId=room,UserId=outsider.Id,JoinedAt=DateTimeOffset.UtcNow.AddSeconds(1)});await db.SaveChangesAsync();
        Assert.Equal(404,(await Assert.ThrowsAsync<DomainException>(()=>service.SendMessageAsync(new(room,"Incorreta","text",originalId),Actor(outsider)))).StatusCode);
        await service.DeleteMessageAsync(new(room,originalId,1),Actor(sender));
        Assert.Equal(404,(await Assert.ThrowsAsync<DomainException>(()=>service.SendMessageAsync(new(room,"Incorreta","text",originalId),Actor(reader)))).StatusCode);
    }

    [Fact]
    public async Task Attachment_and_poll_replies_keep_the_selected_message()
    {
        await using var db=CreateContext();var sender=AddUser(db,"sender@test","Remetente");sender.IsCoordinator=true;
        var reader=AddUser(db,"reader@test","Leitor");await db.SaveChangesAsync();var service=CreateService(db);
        var room=await service.CreateRoomAsync(new("Equipe",null,true,[reader.Id]),Actor(sender));
        var original=await service.SendMessageAsync(new(room,"Qual arquivo?","text"),Actor(sender));
        await using var content=new MemoryStream([1,2,3]);
        var attachment=await service.UploadAttachmentAsync(new(room,"arquivo.txt","text/plain",content.Length,content,original),Actor(reader));
        try
        {
            var poll=await service.CreatePollAsync(new(room,"Concordam?",["Sim","Não"],original),Actor(reader));
            var messages=(await service.GetModuleAsync(Actor(sender))).Rooms.Single().Messages;
            Assert.All(messages.Where(message=>message.Id==attachment||message.Id==poll),message=>Assert.Equal(original,message.ReplyTo!.Id));
        }
        finally {File.Delete((await service.GetAttachmentAsync(attachment,Actor(reader))).FullPath);}
    }

    [Fact]
    public async Task Seen_time_is_the_first_receipt_and_stays_stable_when_the_room_is_read_again()
    {
        await using var db=CreateContext();var sender=AddUser(db,"sender@test","Remetente");var reader=AddUser(db,"reader@test","Leitor");await db.SaveChangesAsync();
        var service=CreateService(db);var room=await service.CreateRoomAsync(new(null,null,false,[reader.Id]),Actor(sender));
        var id=await service.SendMessageAsync(new(room,"Primeira","text"),Actor(sender));
        Assert.Null((await service.GetModuleAsync(Actor(sender))).Rooms.Single().Messages.Single().SeenAt);
        await service.MarkReadAsync(new(room),Actor(reader));
        var first=(await service.GetModuleAsync(Actor(sender))).Rooms.Single().Messages.Single();
        Assert.NotNull(first.SeenAt);Assert.Equal("seen",first.ReceiptState);Assert.Equal(1,first.SeenByCount);Assert.Equal(1,first.RecipientCount);
        await service.SendMessageAsync(new(room,"Segunda","text"),Actor(sender));
        await service.MarkReadAsync(new(room),Actor(reader));await service.MarkReadAsync(new(room),Actor(reader));
        Assert.Equal(first.SeenAt,(await service.GetModuleAsync(Actor(sender))).Rooms.Single().Messages.Single(message=>message.Id==id).SeenAt);
        Assert.Equal(2,await db.InternalChatMessageReceipts.CountAsync());
    }

    [Fact]
    public async Task Group_receipts_distinguish_partial_reads_and_exclude_people_who_joined_after_the_message()
    {
        await using var db=CreateContext();var sender=AddUser(db,"sender@test","Remetente");sender.IsCoordinator=true;
        var first=AddUser(db,"first@test","Primeiro");var second=AddUser(db,"second@test","Segundo");var late=AddUser(db,"late@test","Novo");await db.SaveChangesAsync();
        var service=CreateService(db);var room=await service.CreateRoomAsync(new("Equipe",null,true,[first.Id,second.Id]),Actor(sender));
        var id=await service.SendMessageAsync(new(room,"Mensagem anterior","text"),Actor(sender));
        db.InternalChatRoomMembers.Add(new(){RoomId=room,UserId=late.Id,JoinedAt=DateTimeOffset.UtcNow.AddSeconds(1)});await db.SaveChangesAsync();
        await service.MarkReadAsync(new(room),Actor(first));
        var partial=(await service.GetModuleAsync(Actor(sender))).Rooms.Single().Messages.Single();
        Assert.Equal(1,partial.SeenByCount);Assert.Equal(2,partial.RecipientCount);Assert.Equal("delivered",partial.ReceiptState);
        await service.MarkReadAsync(new(room),Actor(second));
        Assert.Equal("seen",(await service.GetModuleAsync(Actor(sender))).Rooms.Single().Messages.Single().ReceiptState);
        Assert.Equal(404,(await Assert.ThrowsAsync<DomainException>(()=>service.SetMessageReactionAsync(new(room,id,"👍",true),Actor(late)))).StatusCode);
    }

    [Fact]
    public async Task Reactions_are_persistent_idempotent_replaceable_and_private_to_the_room()
    {
        await using var db=CreateContext();var sender=AddUser(db,"sender@test","Remetente");var reader=AddUser(db,"reader@test","Leitor");var outsider=AddUser(db,"other@test","Outro");await db.SaveChangesAsync();
        var service=CreateService(db);var room=await service.CreateRoomAsync(new(null,null,false,[reader.Id]),Actor(sender));
        var id=await service.SendMessageAsync(new(room,"Pode conferir?","text"),Actor(sender));
        await service.SetMessageReactionAsync(new(room,id,"👍",true),Actor(reader));await service.SetMessageReactionAsync(new(room,id,"👍",true),Actor(reader));
        Assert.Single(db.InternalChatMessageReactions);
        await service.SetMessageReactionAsync(new(room,id,"👍",true),Actor(sender));
        var reaction=Assert.Single((await service.GetModuleAsync(Actor(reader))).Rooms.Single().Messages.Single().Reactions);
        Assert.Equal(2,reaction.Count);Assert.Contains(reader.Id,reaction.UserIds);Assert.Contains("Remetente",reaction.UserNames);
        await service.SetMessageReactionAsync(new(room,id,"❤️",true),Actor(reader));
        Assert.Equal(2,await db.InternalChatMessageReactions.CountAsync());
        await service.SetMessageReactionAsync(new(room,id,"👍",false),Actor(reader));
        Assert.Contains(db.InternalChatMessageReactions,entry=>entry.UserId==reader.Id&&entry.Emoji=="❤️");
        await service.SetMessageReactionAsync(new(room,id,"❤️",false),Actor(reader));
        Assert.Single(db.InternalChatMessageReactions);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.SetMessageReactionAsync(new(room,id,"👍",true),Actor(outsider)))).StatusCode);
        await Assert.ThrowsAsync<DomainException>(()=>service.SetMessageReactionAsync(new(room,id,"texto",true),Actor(reader)));
        await service.DeleteMessageAsync(new(room,id,1),Actor(sender));
        Assert.Empty((await service.GetModuleAsync(Actor(reader))).Rooms.Single().Messages.Single().Reactions);
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.SetMessageReactionAsync(new(room,id,"👍",true),Actor(reader)))).StatusCode);
    }

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
        foreach (var message in db.InternalChatMessages) { message.CreatedAt = DateTimeOffset.UtcNow.AddDays(-45); message.UpdatedAt = message.CreatedAt; }
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
        var oldMessage = await db.InternalChatMessages.SingleAsync(message => message.Id == oldId); oldMessage.CreatedAt = DateTimeOffset.UtcNow.AddDays(-45); oldMessage.UpdatedAt = oldMessage.CreatedAt;
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
        var oldMessage = await db.InternalChatMessages.SingleAsync(); oldMessage.CreatedAt=DateTimeOffset.UtcNow.AddDays(-45); oldMessage.UpdatedAt=oldMessage.CreatedAt; await db.SaveChangesAsync();
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
